import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApp } from '../src/app.js';
import { type AuthConfig, createAuth } from '../src/auth.js';
import { maskEmail, type SignInEvent, signInLine } from '../src/signin-log.js';
import { signInWithGitHub as signIn } from './github.js';

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
const signInWithGitHub = (base: string, account: { id: number; email: string }, requestId?: string) => signIn(base, account, { ip: IP, userAgent: UA, requestId });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup(allowedEmails = config.allowedEmails) {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [], passkey: [] };
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
    const r = await signInWithGitHub(base, { id: 1, email: 'owner@example.com' }, 'app-req.1');
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('x-request-id'), 'app-req.1');
    assert.doesNotMatch(r.headers.get('location') ?? '', /error/);
  });
  const userId = (db.user![0] as { id: string }).id;
  assert.deepEqual(events, [{ outcome: 'success', provider: 'github', userId, ip: IP, userAgent: UA, requestId: 'app-req.1' }]);
});

test('an email outside the allow list logs one refusal with the email masked', async () => {
  const { db, events, app } = setup();
  await serve(app, async (base) => {
    const r = await signInWithGitHub(base, { id: 2, email: 'stranger@example.com' });
    // The reason code reaches the sign-in page, which maps it to its message (#44).
    assert.match(r.headers.get('location') ?? '', /^\/sign-in\?error=not_allowed&/);
  });
  assert.equal(db.user!.length, 0);
  assert.match(events[0]?.requestId ?? '', UUID, 'without an incoming ID the line gets a new one');
  assert.deepEqual(events, [{ outcome: 'refused_not_allowed', provider: 'github', email: 's***@example.com', ip: IP, userAgent: UA, requestId: events[0]!.requestId }]);
});

test('a second allowed account logs a second-user refusal, not a success', async () => {
  const { db, events, app } = setup();
  await serve(app, async (base) => {
    await signInWithGitHub(base, { id: 1, email: 'owner@example.com' });
    const r = await signInWithGitHub(base, { id: 3, email: 'second@example.net' });
    assert.match(r.headers.get('location') ?? '', /^\/sign-in\?error=second_user&/);
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
    assert.match(r.headers.get('location') ?? '', /^\/sign-in\?error=not_allowed&/);
  });
  const userId = (db.user![0] as { id: string }).id;
  assert.match(events[0]?.requestId ?? '', UUID);
  assert.deepEqual(events, [{ outcome: 'refused_not_allowed', provider: 'github', userId, ip: IP, userAgent: UA, requestId: events[0]!.requestId }]);
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
