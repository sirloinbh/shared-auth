// A mocked GitHub sign-in for tests: the provider's token and user endpoints answer with a given account.

/** The test config's baseURL; Better Auth checks the Origin of every POST against it. */
export const BASE_URL = 'http://localhost:3110';

/** Answers GitHub's token and user endpoints with the given account; every other URL goes to the real fetch. */
export function fakeGitHub(account: { id: number; email: string }) {
  const real = globalThis.fetch;
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.href.startsWith('https://github.com/login/oauth/access_token')) return json({ access_token: 'gh-token', token_type: 'bearer', scope: 'read:user,user:email' });
    if (url.href === 'https://api.github.com/user') return json({ id: account.id, login: `user${account.id}`, name: 'Someone', email: account.email, avatar_url: '' });
    if (url.href === 'https://api.github.com/user/emails') return json([{ email: account.email, primary: true, verified: true, visibility: 'private' }]);
    return real(input, init);
  };
  return () => void (globalThis.fetch = real);
}

/** Starts a GitHub sign-in and follows the callback as GitHub would send the browser back. */
export async function signInWithGitHub(base: string, account: { id: number; email: string }, client: { ip: string; userAgent: string }) {
  const restore = fakeGitHub(account);
  try {
    // Like a browser behind nginx, both requests carry the client's address (rate limits count per IP).
    const via = { 'user-agent': client.userAgent, 'x-forwarded-for': client.ip, 'x-real-ip': client.ip };
    const start = await fetch(`${base}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE_URL, ...via },
      body: JSON.stringify({ provider: 'github', callbackURL: '/account', errorCallbackURL: '/sign-in' }),
    });
    const state = new URL(((await start.json()) as { url: string }).url).searchParams.get('state')!;
    const cookie = start.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    return await fetch(`${base}/api/auth/callback/github?code=fake-code&state=${state}`, { headers: { cookie, ...via }, redirect: 'manual' });
  } finally {
    restore();
  }
}

/** The session cookie (name=value) from a callback response, ready for a Cookie header. */
export const sessionCookie = (r: Response) => r.headers.getSetCookie().map((c) => c.split(';')[0]!).find((c) => c.startsWith('sirloinbh.session_token='))!;
