import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApp } from '../src/app.js';
import { type AuthConfig, createAuth, RATE_LIMIT, revokeRemovedUsers, SESSION } from '../src/auth.js';

const config: AuthConfig = {
  baseURL: 'http://localhost:3110',
  rootDomain: 'daysofme.com',
  secret: 'test-secret-that-is-long-enough-for-better-auth-0123456789',
  allowedEmails: ['owner@example.com', 'second@example.net'],
  github: { clientId: 'gh-id', clientSecret: 'gh-secret' },
  google: { clientId: 'go-id', clientSecret: 'go-secret' },
  production: false,
};

function setup({ ping = async () => {}, production = false } = {}) {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [], passkey: [] };
  const auth = createAuth({ ...config, production }, memoryAdapter(db), async () => db.user!.length, () => {});
  return { auth, db, app: createApp(auth, { baseURL: config.baseURL, rootDomain: config.rootDomain, ping }) };
}

async function serve(app: ReturnType<typeof setup>['app'], run: (base: string) => Promise<void>) {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

test('health answers 200, or 503 when the database is down', async () => {
  await serve(setup().app, async (base) => assert.equal((await fetch(`${base}/api/health`)).status, 200));
  const down = setup({ ping: async () => Promise.reject(new Error('down')) });
  await serve(down.app, async (base) => assert.equal((await fetch(`${base}/api/health`)).status, 503));
});

test('the sign-in page offers GitHub and Google and never returns to a foreign site', async () => {
  await serve(setup().app, async (base) => {
    const page = await (await fetch(`${base}/sign-in?returnTo=${encodeURIComponent('https://evil.com/')}`)).text();
    assert.match(page, /Continue with GitHub/);
    assert.match(page, /Continue with Google/);
    assert.doesNotMatch(page, /evil\.com/);
    assert.match(page, /https:\/\/auth\.daysofme\.com\/account|http:\/\/localhost:3110\/account/);
    const app = await (await fetch(`${base}/sign-in?returnTo=${encodeURIComponent('https://workout-memo.daysofme.com/logs')}`)).text();
    assert.match(app, /workout-memo\.daysofme\.com\/logs/);
    assert.match(app, /to continue to <strong>FORM · My Workout Log<\/strong>/);
  });
});

test('the account page needs a session', async () => {
  await serve(setup().app, async (base) => {
    const r = await fetch(`${base}/account`, { redirect: 'manual' });
    assert.equal(r.status, 303);
    assert.match(r.headers.get('location') ?? '', /^\/sign-in\?returnTo=/);
  });
});

test('starting a GitHub sign-in returns the GitHub URL with the callback on this service', async () => {
  await serve(setup().app, async (base) => {
    const r = await fetch(`${base}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.baseURL },
      body: JSON.stringify({ provider: 'github', callbackURL: 'https://workout-memo.daysofme.com/' }),
    });
    assert.equal(r.status, 200);
    const { url } = (await r.json()) as { url: string };
    const target = new URL(url);
    assert.equal(target.origin + target.pathname, 'https://github.com/login/oauth/authorize');
    assert.equal(target.searchParams.get('redirect_uri'), `${config.baseURL}/api/auth/callback/github`);
    assert.match(target.searchParams.get('scope') ?? '', /user:email/);
  });
});

test('a callback to a site outside the root domain is refused', async () => {
  await serve(setup().app, async (base) => {
    const r = await fetch(`${base}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.baseURL },
      body: JSON.stringify({ provider: 'github', callbackURL: 'https://evil.com/' }),
    });
    assert.equal(r.status, 403);
  });
});

test('only allowed emails create a user, and only the first one', async () => {
  const { auth, db } = setup();
  const ctx = await auth.$context;
  await assert.rejects(ctx.internalAdapter.createUser({ email: 'stranger@example.com', name: 'x', emailVerified: true }), { body: { code: 'not_allowed', message: 'This account is not allowed to sign in.' } });
  await ctx.internalAdapter.createUser({ email: 'owner@example.com', name: 'Owner', emailVerified: true });
  await assert.rejects(ctx.internalAdapter.createUser({ email: 'second@example.net', name: 'x', emailVerified: true }), { body: { code: 'second_user', message: 'Sign in with the account you used first, then link this one on the account page.' } });
  assert.equal(db.user!.length, 1);
});

test('the session cookie is the one @sirloinbh/auth-client reads, shared with the root domain in production', async () => {
  const local = await setup().auth.$context;
  assert.equal(local.authCookies.sessionToken.name, 'sirloinbh.session_token');
  const prod = await setup({ production: true }).auth.$context;
  assert.equal(prod.authCookies.sessionToken.name, '__Secure-sirloinbh.session_token');
  assert.equal(prod.authCookies.sessionToken.attributes.domain, 'daysofme.com');
});

test('a session is created only while the email of its user is still allowed', async () => {
  const { auth, db } = setup();
  const ctx = await auth.$context;
  const owner = await ctx.internalAdapter.createUser({ email: 'owner@example.com', name: 'Owner', emailVerified: true });
  await ctx.internalAdapter.createSession(owner.id);
  assert.equal(db.session!.length, 1);

  // Same database, restarted with the owner's email removed from ALLOWED_EMAILS.
  const removed = createAuth({ ...config, allowedEmails: ['second@example.net'] }, memoryAdapter(db), async () => db.user!.length, () => {});
  // The code makes the OAuth callback redirect to /sign-in?error=not_allowed instead of answering a bare 403.
  await assert.rejects((await removed.$context).internalAdapter.createSession(owner.id), { body: { code: 'not_allowed', message: 'This account is not allowed to sign in.' } });
  assert.equal(db.session!.length, 1);
});

test('on start, sessions of users whose email was removed are deleted', async () => {
  const { auth, db } = setup();
  const ctx = await auth.$context;
  const owner = await ctx.internalAdapter.createUser({ email: 'Owner@Example.com', name: 'Owner', emailVerified: true });
  await ctx.internalAdapter.createSession(owner.id);
  assert.equal(await revokeRemovedUsers(auth, config.allowedEmails), 0);
  assert.equal(db.session!.length, 1);

  const removed = createAuth({ ...config, allowedEmails: ['second@example.net'] }, memoryAdapter(db), async () => db.user!.length, () => {});
  assert.equal(await revokeRemovedUsers(removed, ['second@example.net']), 1);
  assert.equal(db.session!.length, 0);
  assert.equal(db.user!.length, 1);
});

test('sessions last 30 days, move forward daily, and are never served from a cookie cache', async () => {
  const { auth } = setup();
  const ctx = await auth.$context;
  assert.equal(SESSION.expiresIn, 30 * 24 * 60 * 60);
  assert.equal(ctx.sessionConfig.expiresIn, SESSION.expiresIn);
  assert.equal(ctx.sessionConfig.updateAge, 24 * 60 * 60);
  assert.equal(ctx.options.session?.cookieCache?.enabled, false);

  const owner = await ctx.internalAdapter.createUser({ email: 'owner@example.com', name: 'Owner', emailVerified: true });
  const before = Date.now();
  const session = await ctx.internalAdapter.createSession(owner.id);
  const lifetime = (new Date(session.expiresAt).getTime() - before) / 1000;
  assert.ok(Math.abs(lifetime - SESSION.expiresIn) < 60, `lifetime ${lifetime}s`);
  assert.equal(ctx.authCookies.sessionToken.attributes.maxAge, SESSION.expiresIn);
});

// Better Auth keeps the rate limit counts in one in-memory store per process, so each test below uses its
// own addresses (203.0.113.0/24 is reserved for documentation) to stay apart from the other tests.
const startSignIn = (base: string, headers: Record<string, string>) =>
  fetch(`${base}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: config.baseURL, ...headers },
    body: JSON.stringify({ provider: 'github', callbackURL: 'https://workout-memo.daysofme.com/' }),
  }).then((r) => r.status);

test('sign-in starts are limited per client IP from X-Real-IP, and going over answers 429', async () => {
  const max = RATE_LIMIT.rules['/sign-in/*'].max;
  await serve(setup().app, async (base) => {
    for (let i = 0; i < max; i++) assert.equal(await startSignIn(base, { 'x-real-ip': '203.0.113.10' }), 200, `request ${i + 1}`);
    assert.equal(await startSignIn(base, { 'x-real-ip': '203.0.113.10' }), 429);
    // Another client behind the same proxy has its own count.
    assert.equal(await startSignIn(base, { 'x-real-ip': '203.0.113.11' }), 200);
  });
});

test('a forged X-Forwarded-For does not move a client to a fresh count', async () => {
  const max = RATE_LIMIT.rules['/sign-in/*'].max;
  await serve(setup().app, async (base) => {
    const as = (i: number) => ({ 'x-real-ip': '203.0.113.20', 'x-forwarded-for': `198.51.100.${i}, 203.0.113.20` });
    for (let i = 0; i < max; i++) assert.equal(await startSignIn(base, as(i)), 200, `request ${i + 1}`);
    assert.equal(await startSignIn(base, as(99)), 429);
  });
});

test('session checks from app containers (no X-Real-IP) are not limited, browser ones are', async () => {
  await serve(setup().app, async (base) => {
    const check = (headers: Record<string, string>) => fetch(`${base}/api/auth/get-session`, { headers }).then((r) => r.status);
    for (let i = 0; i <= RATE_LIMIT.max; i++) assert.equal(await check({}), 200, `internal request ${i + 1}`);
    for (let i = 0; i < RATE_LIMIT.max; i++) assert.equal(await check({ 'x-real-ip': '203.0.113.30' }), 200, `browser request ${i + 1}`);
    assert.equal(await check({ 'x-real-ip': '203.0.113.30' }), 429);
  });
});

test('a refused sign-in shows the message for its reason, and a fixed default for any other code', async () => {
  await serve(setup().app, async (base) => {
    const page = async (error: string) => (await fetch(`${base}/sign-in?error=${encodeURIComponent(error)}`)).text();
    assert.match(await page('not_allowed'), /role="alert">This account is not allowed to sign in\.</);
    assert.match(await page('second_user'), /role="alert">Sign in with the account you used first, then link this one on the account page\.</);
    const unknown = await page('<script>alert(1)</script>');
    assert.match(unknown, /role="alert">Sign-in did not finish\. Try again, and use an allowed account\.</);
    assert.doesNotMatch(unknown, /alert\(1\)/);
    assert.match(await page('toString'), /Sign-in did not finish/);
    assert.match(await (await fetch(`${base}/sign-in`)).text(), /role="alert"><\/p>/);
  });
});

test('a refused sign-in comes back to the sign-in page with the same returnTo', async () => {
  await serve(setup().app, async (base) => {
    const returnTo = 'https://workout-memo.daysofme.com/logs';
    const page = await (await fetch(`${base}/sign-in?returnTo=${encodeURIComponent(returnTo)}`)).text();
    const errorCallbackURL = `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
    assert.ok(page.includes(`&#34;errorCallbackURL&#34;:&#34;${errorCallbackURL}&#34;`));
    const r = await fetch(`${base}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.baseURL },
      body: JSON.stringify({ provider: 'github', callbackURL: returnTo, errorCallbackURL }),
    });
    assert.equal(r.status, 200);
  });
});
