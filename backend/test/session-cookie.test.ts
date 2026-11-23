// Renewing the browser's session cookie on the auth pages (#48).
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { makeSignature } from 'better-auth/crypto';
import { createApp } from '../src/app.js';
import { type AuthConfig, createAuth, SESSION } from '../src/auth.js';
import { cookieValue, renewedCookie } from '../src/session-cookie.js';

const config: AuthConfig = {
  baseURL: 'http://localhost:3110',
  rootDomain: 'daysofme.com',
  secret: 'test-secret-that-is-long-enough-for-better-auth-0123456789',
  allowedEmails: ['owner@example.com'],
  github: { clientId: 'gh-id', clientSecret: 'gh-secret' },
  google: { clientId: 'go-id', clientSecret: 'go-secret' },
  production: false,
};

const DAY = 24 * 60 * 60;

test('the cookie value is read as sent, and the renewed line keeps the name, value, and attributes', () => {
  assert.equal(cookieValue('a=1; sirloinbh.session_token=tok.sig%3D; b=2', 'sirloinbh.session_token', 'tok'), 'tok.sig%3D');
  // Two cookies with one name: only the one carrying the accepted token is renewed.
  assert.equal(cookieValue('sirloinbh.session_token=planted.x; sirloinbh.session_token=tok.sig', 'sirloinbh.session_token', 'tok'), 'tok.sig');
  assert.equal(cookieValue('sirloinbh.session_token=planted.x', 'sirloinbh.session_token', 'tok'), null);
  assert.equal(cookieValue('xsirloinbh.session_token=tok.1', 'sirloinbh.session_token', 'tok'), null);
  assert.equal(cookieValue(undefined, 'sirloinbh.session_token', 'tok'), null);

  const cookie = { name: '__Secure-sirloinbh.session_token', attributes: { path: '/', domain: 'daysofme.com', secure: true, httpOnly: true, sameSite: 'lax' } };
  const now = Date.UTC(2026, 10, 23);
  const line = renewedCookie(cookie, '__Secure-sirloinbh.session_token=tok.sig%3D', { token: 'tok', expiresAt: new Date(now + 20 * DAY * 1000) }, now);
  assert.equal(line, `__Secure-sirloinbh.session_token=tok.sig%3D; Max-Age=${20 * DAY}; Expires=${new Date(now + 20 * DAY * 1000).toUTCString()}; Path=/; Domain=daysofme.com; HttpOnly; Secure; SameSite=Lax`);
  assert.equal(renewedCookie(cookie, '', { token: 'tok', expiresAt: new Date(now + DAY * 1000) }, now), null, 'no cookie, nothing to renew');
  assert.equal(renewedCookie(cookie, '__Secure-sirloinbh.session_token=tok.x', { token: 'tok', expiresAt: new Date(now - 1000) }, now), null, 'an ended session is not renewed');
});

function setup() {
  const db: Record<string, Record<string, unknown>[]> = { user: [], session: [], account: [], verification: [], passkey: [] };
  const auth = createAuth(config, memoryAdapter(db), async () => db.user!.length, () => {});
  return { auth, db, app: createApp(auth, { baseURL: config.baseURL, rootDomain: config.rootDomain, ping: async () => {} }) };
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

/**
 * The owner signed in 25 days ago, and the apps' session checks have kept the database expiry moving,
 * so it now ends in 29.5 days (refreshed less than a day ago) while the browser cookie, set at sign-in, ends in 5.
 */
async function slidSession(auth: ReturnType<typeof setup>['auth'], db: ReturnType<typeof setup>['db']) {
  const ctx = await auth.$context;
  const owner = await ctx.internalAdapter.createUser({ email: 'owner@example.com', name: 'Owner', emailVerified: true });
  const { token } = await ctx.internalAdapter.createSession(owner.id);
  const row = db.session!.find((s) => s.token === token)!;
  row.createdAt = new Date(Date.now() - 25 * DAY * 1000);
  row.updatedAt = new Date(Date.now() - 60 * 60 * 1000);
  row.expiresAt = new Date(Date.now() + 29.5 * DAY * 1000);
  const value = encodeURIComponent(`${token}.${await makeSignature(token, config.secret)}`);
  return { value, cookie: `sirloinbh.session_token=${value}` };
}

const sessionCookieOf = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith('sirloinbh.session_token='));

test('opening /account renews the browser cookie to the session expiry in the database', async () => {
  const { auth, app, db } = setup();
  const { value, cookie } = await slidSession(auth, db);
  await serve(app, async (base) => {
    const r = await fetch(`${base}/account`, { headers: { cookie } });
    assert.equal(r.status, 200);
    const line = sessionCookieOf(r);
    assert.ok(line, 'Set-Cookie for the session token');
    assert.ok(line.startsWith(`sirloinbh.session_token=${value};`), 'same signed value');
    const maxAge = Number(/Max-Age=(\d+)/.exec(line)?.[1]);
    assert.ok(Math.abs(maxAge - 29.5 * DAY) < 60, `Max-Age ${maxAge}`);
    assert.match(line, /HttpOnly/);
    assert.match(line, /SameSite=Lax/);
  });
});

test('a signed-in visit to /sign-in renews the cookie on its way back to the app', async () => {
  const { auth, app, db } = setup();
  const { cookie } = await slidSession(auth, db);
  await serve(app, async (base) => {
    const r = await fetch(`${base}/sign-in?returnTo=${encodeURIComponent('https://workout-memo.daysofme.com/')}`, { headers: { cookie }, redirect: 'manual' });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), 'https://workout-memo.daysofme.com/');
    assert.ok(sessionCookieOf(r));
  });
});

test('without a session there is no cookie to renew', async () => {
  await serve(setup().app, async (base) => {
    const r = await fetch(`${base}/sign-in`, { headers: { cookie: 'sirloinbh.session_token=forged.value' } });
    assert.equal(r.status, 200);
    assert.equal(sessionCookieOf(r), undefined);
  });
});

test('the renewal never outlasts the configured session lifetime', () => {
  const now = Date.now();
  const line = renewedCookie({ name: 'n', attributes: {} }, 'n=t.v', { token: 't', expiresAt: new Date(now + SESSION.expiresIn * 1000) }, now);
  assert.equal(Number(/Max-Age=(\d+)/.exec(line ?? '')?.[1]), SESSION.expiresIn);
});
