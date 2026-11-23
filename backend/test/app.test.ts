import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApp } from '../src/app.js';
import { type AuthConfig, createAuth, revokeRemovedUsers } from '../src/auth.js';

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
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
  const auth = createAuth({ ...config, production }, memoryAdapter(db), async () => db.user!.length);
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
  await assert.rejects(ctx.internalAdapter.createUser({ email: 'stranger@example.com', name: 'x', emailVerified: true }), /not allowed/);
  await ctx.internalAdapter.createUser({ email: 'owner@example.com', name: 'Owner', emailVerified: true });
  await assert.rejects(ctx.internalAdapter.createUser({ email: 'second@example.net', name: 'x', emailVerified: true }), /link this one/);
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
  const removed = createAuth({ ...config, allowedEmails: ['second@example.net'] }, memoryAdapter(db), async () => db.user!.length);
  await assert.rejects((await removed.$context).internalAdapter.createSession(owner.id), /not allowed/);
  assert.equal(db.session!.length, 1);
});

test('on start, sessions of users whose email was removed are deleted', async () => {
  const { auth, db } = setup();
  const ctx = await auth.$context;
  const owner = await ctx.internalAdapter.createUser({ email: 'Owner@Example.com', name: 'Owner', emailVerified: true });
  await ctx.internalAdapter.createSession(owner.id);
  assert.equal(await revokeRemovedUsers(auth, config.allowedEmails), 0);
  assert.equal(db.session!.length, 1);

  const removed = createAuth({ ...config, allowedEmails: ['second@example.net'] }, memoryAdapter(db), async () => db.user!.length);
  assert.equal(await revokeRemovedUsers(removed, ['second@example.net']), 1);
  assert.equal(db.session!.length, 0);
  assert.equal(db.user!.length, 1);
});
