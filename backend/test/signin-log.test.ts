import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApp } from '../src/app.js';
import { type AuthConfig, createAuth } from '../src/auth.js';
import { maskEmail, type SignInEvent, signInLine } from '../src/signin-log.js';

const config: AuthConfig = {
  baseURL: 'http://localhost:3110',
  rootDomain: 'daysofme.com',
  secret: 'test-secret-that-is-long-enough-for-better-auth-0123456789',
  allowedEmails: ['owner@example.com', 'second@example.net'],
  github: { clientId: 'gh-id', clientSecret: 'gh-secret' },
  google: { clientId: 'go-id', clientSecret: 'go-secret' },
  production: false,
};

const IP = '203.0.113.7';
const UA = 'Mozilla/5.0 (test)';

/** Answers GitHub's token and user endpoints with the given account; every other URL goes to the real fetch. */
function fakeGitHub(account: { id: number; email: string }) {
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
async function signInWithGitHub(base: string, account: { id: number; email: string }) {
  const restore = fakeGitHub(account);
  try {
    const start = await fetch(`${base}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: config.baseURL },
      body: JSON.stringify({ provider: 'github', callbackURL: '/account', errorCallbackURL: '/sign-in' }),
    });
    const state = new URL(((await start.json()) as { url: string }).url).searchParams.get('state')!;
    const cookie = start.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const client = { 'user-agent': UA, 'x-forwarded-for': IP, 'x-real-ip': IP };
    return await fetch(`${base}/api/auth/callback/github?code=fake-code&state=${state}`, { headers: { cookie, ...client }, redirect: 'manual' });
  } finally {
    restore();
  }
}

function setup(allowedEmails = config.allowedEmails) {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
  const events: SignInEvent[] = [];
  const auth = createAuth({ ...config, allowedEmails }, memoryAdapter(db), async () => db.user!.length, (e) => events.push(e));
  return { db, events, app: createApp(auth, { baseURL: config.baseURL, rootDomain: config.rootDomain, ping: async () => {} }) };
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

test('a successful GitHub sign-in logs one success with the user id, IP, and user agent', async () => {
  const { db, events, app } = setup();
  await serve(app, async (base) => {
    const r = await signInWithGitHub(base, { id: 1, email: 'owner@example.com' });
    assert.equal(r.status, 302);
    assert.doesNotMatch(r.headers.get('location') ?? '', /error/);
  });
  const userId = (db.user![0] as { id: string }).id;
  assert.deepEqual(events, [{ outcome: 'success', provider: 'github', userId, ip: IP, userAgent: UA }]);
});

test('an email outside the allow list logs one refusal with the email masked', async () => {
  const { db, events, app } = setup();
  await serve(app, async (base) => {
    const r = await signInWithGitHub(base, { id: 2, email: 'stranger@example.com' });
    assert.match(r.headers.get('location') ?? '', /error/);
  });
  assert.equal(db.user!.length, 0);
  assert.deepEqual(events, [{ outcome: 'refused_not_allowed', provider: 'github', email: 's***@example.com', ip: IP, userAgent: UA }]);
});

test('a second allowed account logs a second-user refusal, not a success', async () => {
  const { db, events, app } = setup();
  await serve(app, async (base) => {
    await signInWithGitHub(base, { id: 1, email: 'owner@example.com' });
    const r = await signInWithGitHub(base, { id: 3, email: 'second@example.net' });
    assert.match(r.headers.get('location') ?? '', /error/);
  });
  assert.equal(db.user!.length, 1);
  assert.deepEqual(events.map((e) => e.outcome), ['success', 'refused_second_user']);
  assert.equal(events[1]!.email, 's***@example.net');
});

test('a removed email signing in again logs a refusal with its user id', async () => {
  const { db, app } = setup();
  await serve(app, async (base) => void (await signInWithGitHub(base, { id: 1, email: 'owner@example.com' })));
  // The same database, restarted with the owner removed from ALLOWED_EMAILS.
  const events: SignInEvent[] = [];
  const removed = createAuth({ ...config, allowedEmails: ['second@example.net'] }, memoryAdapter(db), async () => db.user!.length, (e) => events.push(e));
  await serve(createApp(removed, { baseURL: config.baseURL, rootDomain: config.rootDomain, ping: async () => {} }), async (base) => {
    const r = await signInWithGitHub(base, { id: 1, email: 'owner@example.com' });
    assert.match(r.headers.get('location') ?? '', /error/);
  });
  const userId = (db.user![0] as { id: string }).id;
  assert.deepEqual(events, [{ outcome: 'refused_not_allowed', provider: 'github', userId, ip: IP, userAgent: UA }]);
});

test('the log line is one JSON object: info for a success, warn for a refusal, no full email', () => {
  const now = new Date('2026-11-23T03:00:00.000Z');
  const ok = JSON.parse(signInLine({ outcome: 'success', provider: 'google', userId: 'u1', ip: IP, userAgent: UA }, now));
  assert.deepEqual(ok, { time: '2026-11-23T03:00:00.000Z', level: 'info', event: 'sign_in', outcome: 'success', provider: 'google', userId: 'u1', ip: IP, userAgent: UA });
  const line = signInLine({ outcome: 'refused_not_allowed', provider: 'github', email: maskEmail('Stranger@Example.com'), ip: null, userAgent: 'x'.repeat(1000) }, now);
  assert.doesNotMatch(line, /\n|tranger/);
  const refused = JSON.parse(line);
  assert.equal(refused.level, 'warn');
  assert.equal(refused.email, 'S***@example.com');
  assert.equal(refused.ip, null);
  assert.equal(refused.userAgent.length, 300);
});

test('maskEmail keeps the first letter and the domain only', () => {
  assert.equal(maskEmail('owner@example.com'), 'o***@example.com');
  assert.equal(maskEmail('@example.com'), '***');
  assert.equal(maskEmail('no-at-sign'), '***');
  assert.equal(maskEmail(null), undefined);
});
