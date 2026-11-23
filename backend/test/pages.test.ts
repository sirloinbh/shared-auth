import assert from 'node:assert/strict';
import test from 'node:test';
import { returnName } from '../src/apps.js';
import { accountPage, signInPage, signOutPage } from '../src/pages.js';
import { STYLES, TOKENS_VERSION } from '../src/styles.js';

const own = 'https://auth.daysofme.com';
const app = 'https://workout-memo.daysofme.com/logs';

const pages = {
  'sign-in': signInPage({ returnTo: app, appName: 'FORM · My Workout Log' }),
  account: accountPage({ name: 'Owner', email: 'owner@example.com' }, ['github']),
  'sign-out': signOutPage({ returnTo: app, appName: 'FORM · My Workout Log' }),
};

test('every page uses the shared design token values in light and dark mode', () => {
  for (const [name, page] of Object.entries(pages)) {
    assert.match(page, /--background: oklch\(1 0 0\)/, name);
    assert.match(page, /--primary: oklch\(0\.205 0 0\)/, name);
    assert.match(page, /--radius: 0\.625rem/, name);
    assert.match(page, /"Pretendard Variable", Pretendard/, name);
    assert.match(page, /@media \(prefers-color-scheme: dark\)[\s\S]*--background: oklch\(0\.145 0 0\)/, name);
    assert.match(page, /<section class="card">/, name);
  }
  // Brand colors live only in the Google mark; the stylesheet uses token values alone.
  assert.doesNotMatch(STYLES, /#[0-9a-f]{3,8}\b/i);
});

test('the token copy names a released design-tokens version', () => {
  assert.match(TOKENS_VERSION, /^\d+\.\d+\.\d+$/);
});

test('the sign-in page names the app and offers both providers with their marks', () => {
  const page = pages['sign-in'];
  assert.match(page, /to continue to <strong>FORM · My Workout Log<\/strong>/);
  assert.match(page, /<svg class="mark" viewBox="0 0 16 16"[^>]*><path fill="currentColor"[^>]*><\/svg><span>Continue with GitHub<\/span>/);
  assert.match(page, /<svg class="mark" viewBox="0 0 48 48"[\s\S]*#4285F4[\s\S]*<\/svg><span>Continue with Google<\/span>/);
  assert.match(page, /you return to FORM · My Workout Log/);
});

test('the sign-in page escapes the app name and shows the error inside the card', () => {
  const page = signInPage({ returnTo: own, appName: '<b>x</b>', error: 'Refused <now>' });
  assert.doesNotMatch(page, /<b>x<\/b>/);
  assert.match(page, /<p id="error" class="error" role="alert">Refused &#60;now&#62;<\/p>/);
});

test('the account page lists the sign-in methods and offers to link the missing one', () => {
  const page = pages.account;
  assert.match(page, /GitHub<\/span><span class="badge">Linked<\/span>/);
  assert.match(page, /data-endpoint="\/api\/auth\/link-social"[^>]*>Link Google<\/button>/);
});

test('the return name is the app display name, the host for an unknown app, or the account', () => {
  assert.equal(returnName(app, own), 'FORM · My Workout Log');
  assert.equal(returnName('https://study-log.daysofme.com/', own), 'Study Log');
  assert.equal(returnName('https://new-app.daysofme.com/', own), 'new-app.daysofme.com');
  assert.equal(returnName(`${own}/account`, own), 'your account');
  assert.equal(returnName('not a url', own), 'your account');
});
