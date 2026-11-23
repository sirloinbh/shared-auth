// Passkey sign-in (#54). A real registration needs a browser authenticator, so these tests cover the
// options Better Auth hands the browser, the routes' guards, the account page, and the rate limit.
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { makeSignature } from 'better-auth/crypto';
import { createApp } from '../src/app.js';
import { type AuthConfig, createAuth, RATE_LIMIT } from '../src/auth.js';

const config: AuthConfig = {
  baseURL: 'http://localhost:3110',
  rootDomain: 'daysofme.com',
  secret: 'test-secret-that-is-long-enough-for-better-auth-0123456789',
  allowedEmails: ['owner@example.com'],
  github: { clientId: 'gh-id', clientSecret: 'gh-secret' },
  google: { clientId: 'go-id', clientSecret: 'go-secret' },
  production: false,
};

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

/** Creates the owner with a session and returns the signed session cookie a browser would send. */
async function signedIn(auth: ReturnType<typeof setup>['auth']) {
  const ctx = await auth.$context;
  const owner = await ctx.internalAdapter.createUser({ email: 'owner@example.com', name: 'Owner', emailVerified: true });
  const { token } = await ctx.internalAdapter.createSession(owner.id);
  return { owner, cookie: `sirloinbh.session_token=${encodeURIComponent(`${token}.${await makeSignature(token, config.secret)}`)}` };
}

test('the passkey plugin is on, with this service as the relying party, and adds the passkey table', async () => {
  const ctx = await setup().auth.$context;
  assert.ok(ctx.options.plugins?.some((p) => p.id === 'passkey'));
  assert.ok(ctx.tables.passkey, 'passkey table in the schema the migration creates');
});

test('the sign-in page offers a passkey and loads the WebAuthn script this service serves', async () => {
  await serve(setup().app, async (base) => {
    const page = await (await fetch(`${base}/sign-in`)).text();
    assert.match(page, /data-passkey="sign-in"/);
    assert.match(page, /<script src="\/assets\/webauthn\.js"><\/script>/);
    const js = await fetch(`${base}/assets/webauthn.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
    assert.match(await js.text(), /SimpleWebAuthnBrowser/);
  });
});

test('passkey sign-in options name this host, and registering one needs a session', async () => {
  await serve(setup().app, async (base) => {
    const r = await fetch(`${base}/api/auth/passkey/generate-authenticate-options`, { headers: { 'x-real-ip': '203.0.113.40' } });
    assert.equal(r.status, 200);
    const options = (await r.json()) as { challenge?: string; rpId?: string };
    assert.ok(options.challenge);
    assert.equal(options.rpId, 'localhost');
    const register = await fetch(`${base}/api/auth/passkey/generate-register-options`, { headers: { 'x-real-ip': '203.0.113.40' } });
    assert.equal(register.status, 401);
  });
});

test('the account page lists passkeys, and the owner can remove one', async () => {
  const { auth, app, db } = setup();
  const { owner, cookie } = await signedIn(auth);
  db.passkey!.push({ id: 'pk1', name: 'Laptop', publicKey: 'x', userId: owner.id, credentialID: 'c1', counter: 0, deviceType: 'singleDevice', backedUp: false, createdAt: new Date('2026-11-01T00:00:00Z') });
  await serve(app, async (base) => {
    const page = await (await fetch(`${base}/account`, { headers: { cookie } })).text();
    assert.match(page, /Laptop <span class="muted">added 2026-11-01<\/span>/);
    assert.match(page, /data-passkey="register"/);

    const register = await fetch(`${base}/api/auth/passkey/generate-register-options`, { headers: { cookie, 'x-real-ip': '203.0.113.41' } });
    assert.equal(register.status, 200);
    const options = (await register.json()) as { rp?: { id?: string }; user?: { name?: string } };
    assert.equal(options.rp?.id, 'localhost');
    assert.equal(options.user?.name, 'owner@example.com');

    const removed = await fetch(`${base}/api/auth/passkey/delete-passkey`, {
      method: 'POST',
      headers: { cookie, origin: config.baseURL, 'content-type': 'application/json', 'x-real-ip': '203.0.113.41' },
      body: JSON.stringify({ id: 'pk1' }),
    });
    assert.equal(removed.status, 200);
    assert.equal(db.passkey!.length, 0);
  });
});

test('passkey routes are limited to 10 a minute per client IP', async () => {
  const max = RATE_LIMIT.rules['/passkey/*'].max;
  await serve(setup().app, async (base) => {
    const ask = (ip: string) => fetch(`${base}/api/auth/passkey/generate-authenticate-options`, { headers: { 'x-real-ip': ip } }).then((r) => r.status);
    for (let i = 0; i < max; i++) assert.equal(await ask('203.0.113.50'), 200, `request ${i + 1}`);
    assert.equal(await ask('203.0.113.50'), 429);
    assert.equal(await ask('203.0.113.51'), 200);
  });
});
