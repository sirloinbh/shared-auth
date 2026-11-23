import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createApp } from '../src/app.js';
import { type Auth, type AuthConfig, createAuth } from '../src/auth.js';
import { describeDevice } from '../src/devices.js';
import { BASE_URL, sessionCookie, signInWithGitHub } from './github.js';

const config: AuthConfig = {
  baseURL: BASE_URL,
  rootDomain: 'daysofme.com',
  secret: 'test-secret-that-is-long-enough-for-better-auth-0123456789',
  allowedEmails: ['owner@example.com'],
  github: { clientId: 'gh-id', clientSecret: 'gh-secret' },
  google: { clientId: 'go-id', clientSecret: 'go-secret' },
  production: false,
};

const OWNER = { id: 1, email: 'owner@example.com' };
const LAPTOP = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' };
const PHONE = { ip: '198.51.100.20', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1' };
const TABLET = { ip: '198.51.100.30', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' };

type Session = { id: string; token: string; userAgent: string; createdAt: Date };

/** Signs the owner in from each device and runs `run` with each device's session cookie. */
async function withDevices(devices: (typeof LAPTOP)[], run: (base: string, cookies: string[], sessions: Session[], auth: Auth) => Promise<void>) {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [], passkey: [] };
  const auth = createAuth(config, memoryAdapter(db), async () => db.user!.length, () => {});
  const server = createApp(auth, { baseURL: config.baseURL, rootDomain: config.rootDomain, ping: async () => {} }).listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const cookies: string[] = [];
    for (const device of devices) cookies.push(sessionCookie(await signInWithGitHub(base, OWNER, device)));
    await run(base, cookies, db.session as Session[], auth);
  } finally {
    server.close();
  }
}

const sessionOf = async (base: string, cookie: string) => (await (await fetch(`${base}/api/auth/get-session`, { headers: { cookie } })).json()) as { session: { id: string } } | null;

const revoke = (base: string, cookie: string | null, id: string, origin: string | null = BASE_URL) =>
  fetch(`${base}/account/sessions/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) },
    body: JSON.stringify({ id }),
  });

test('the account page lists the active sessions, marks this device, and never shows a token', async () => {
  await withDevices([LAPTOP, PHONE], async (base, [laptop], sessions) => {
    const page = await (await fetch(`${base}/account`, { headers: { cookie: laptop! } })).text();
    assert.match(page, /Chrome on Windows<\/span><span class="meta">203\.0\.113\.7 · signed in <time datetime="[^"]+">[^<]+<\/time> · last used <time/);
    assert.match(page, /Chrome on Windows[\s\S]*?<span class="badge">This device<\/span>/);
    assert.match(page, /Safari on iPhone<\/span><span class="meta">198\.51\.100\.20[\s\S]*?data-endpoint="\/account\/sessions\/revoke"[^>]*>Sign out<\/button>/);
    for (const s of sessions) assert.ok(!page.includes(s.token), 'a session token is in the page');
    // With one other session, its own button is enough.
    assert.doesNotMatch(page, /Sign out other devices/);
  });
});

test('signing out another session ends it, and this one keeps working', async () => {
  await withDevices([LAPTOP, PHONE], async (base, [laptop, phone], sessions) => {
    const phoneId = sessions.find((s) => s.userAgent === PHONE.userAgent)!.id;
    assert.ok(await sessionOf(base, phone!));
    const r = await revoke(base, laptop!, phoneId);
    assert.equal(r.status, 200);
    assert.equal(await sessionOf(base, phone!), null);
    assert.ok(await sessionOf(base, laptop!));
  });
});

test('the revoke route refuses other origins, no session, this session, and unknown ids', async () => {
  await withDevices([LAPTOP, PHONE], async (base, [laptop, phone], sessions) => {
    const laptopId = sessions.find((s) => s.userAgent === LAPTOP.userAgent)!.id;
    const phoneId = sessions.find((s) => s.userAgent === PHONE.userAgent)!.id;
    assert.equal((await revoke(base, laptop!, phoneId, null)).status, 403);
    assert.equal((await revoke(base, laptop!, phoneId, 'https://evil.com')).status, 403);
    assert.equal((await revoke(base, null, phoneId)).status, 401);
    assert.equal((await revoke(base, laptop!, laptopId)).status, 400);
    assert.equal((await revoke(base, laptop!, 'no-such-id')).status, 404);
    assert.ok(await sessionOf(base, phone!));
    assert.ok(await sessionOf(base, laptop!));
  });
});

test('"Sign out other devices" ends every session but this one', async () => {
  await withDevices([LAPTOP, PHONE, TABLET], async (base, [laptop, phone, tablet]) => {
    const page = await (await fetch(`${base}/account`, { headers: { cookie: laptop! } })).text();
    assert.match(page, /data-endpoint="\/api\/auth\/revoke-other-sessions"[^>]*>Sign out other devices<\/button>/);
    const r = await fetch(`${base}/api/auth/revoke-other-sessions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: laptop!, origin: BASE_URL }, body: '{}' });
    assert.equal(r.status, 200);
    assert.equal(await sessionOf(base, phone!), null);
    assert.equal(await sessionOf(base, tablet!), null);
    assert.ok(await sessionOf(base, laptop!));
  });
});

test('devices are named by browser and system', () => {
  assert.equal(describeDevice(LAPTOP.userAgent), 'Chrome on Windows');
  assert.equal(describeDevice(PHONE.userAgent), 'Safari on iPhone');
  assert.equal(describeDevice(TABLET.userAgent), 'Chrome on Android');
  assert.equal(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0'), 'Firefox on macOS');
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'), 'Edge on Windows');
  assert.equal(describeDevice('curl/8.0'), 'Unknown device');
  assert.equal(describeDevice(null), 'Unknown device');
});

/** Links Google to the owner directly in the database (a real link goes through Google). */
async function linkGoogle(auth: Auth) {
  const ctx = await auth.$context;
  const owner = (await ctx.internalAdapter.listUsers())[0]!;
  return ctx.internalAdapter.createAccount({ userId: owner.id, providerId: 'google', accountId: 'google-1' });
}

const accountsOf = async (base: string, cookie: string) =>
  (await (await fetch(`${base}/api/auth/list-accounts`, { headers: { cookie } })).json()) as { id: string; providerId: string }[];

const unlink = (base: string, cookie: string, accountId: string) =>
  fetch(`${base}/api/auth/unlink-account`, { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: BASE_URL }, body: JSON.stringify({ accountId }) });

test('with two providers linked, each has an Unlink button, and unlinking one keeps the other', async () => {
  await withDevices([LAPTOP], async (base, [laptop], _sessions, auth) => {
    await linkGoogle(auth);
    const page = await (await fetch(`${base}/account`, { headers: { cookie: laptop! } })).text();
    const accounts = await accountsOf(base, laptop!);
    const google = accounts.find((a) => a.providerId === 'google')!;
    assert.ok(page.includes(`data-body="{&#34;accountId&#34;:&#34;${google.id}&#34;}"`));
    assert.match(page, />Unlink GitHub<\/button>/);
    assert.match(page, />Unlink Google<\/button>/);
    assert.equal((await unlink(base, laptop!, google.id)).status, 200);
    assert.deepEqual((await accountsOf(base, laptop!)).map((a) => a.providerId), ['github']);
  });
});

test('the last provider has no Unlink button, and unlinking it is refused', async () => {
  await withDevices([LAPTOP], async (base, [laptop]) => {
    const page = await (await fetch(`${base}/account`, { headers: { cookie: laptop! } })).text();
    assert.doesNotMatch(page, /Unlink/);
    const [github] = await accountsOf(base, laptop!);
    const r = await unlink(base, laptop!, github!.id);
    assert.equal(r.status, 400);
    assert.equal(((await r.json()) as { code: string }).code, 'FAILED_TO_UNLINK_LAST_ACCOUNT');
    assert.equal((await accountsOf(base, laptop!)).length, 1);
  });
});

test('a session older than a day is asked to sign in again before unlinking', async () => {
  await withDevices([LAPTOP], async (base, [laptop], sessions, auth) => {
    await linkGoogle(auth);
    // Better Auth's freshAge is a day: unlink-account refuses older sessions.
    sessions[0]!.createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const page = await (await fetch(`${base}/account`, { headers: { cookie: laptop! } })).text();
    assert.doesNotMatch(page, />Unlink /);
    assert.match(page, /To unlink a provider, sign in again first[\s\S]*?>Sign in again<\/button>/);
    const google = (await accountsOf(base, laptop!)).find((a) => a.providerId === 'google')!;
    assert.equal((await unlink(base, laptop!, google.id)).status, 403);
  });
});

test('a failed link shows a fixed message on the account page', async () => {
  await withDevices([LAPTOP], async (base, [laptop]) => {
    const page = async (error: string) => (await fetch(`${base}/account?error=${encodeURIComponent(error)}`, { headers: { cookie: laptop! } })).text();
    assert.match(await page('account_already_linked_to_different_user'), /role="alert">That account is already linked to another user\.</);
    const unknown = await page('<i>x</i>');
    assert.match(unknown, /role="alert">Linking did not finish\. Try again\.</);
    assert.doesNotMatch(unknown, /<i>x<\/i>/);
  });
});
