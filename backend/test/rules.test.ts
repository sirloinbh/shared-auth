import assert from 'node:assert/strict';
import test from 'node:test';
import { newUserProblem, parseAllowedEmails, REFUSALS, refusalMessage, SIGN_IN_FAILED, safeReturnTo } from '../src/rules.js';

test('ALLOWED_EMAILS is split, trimmed and lowercased', () => {
  assert.deepEqual(parseAllowedEmails(' Owner@Example.com, second@example.net ,'), ['owner@example.com', 'second@example.net']);
  assert.deepEqual(parseAllowedEmails(undefined), []);
});

test('only an allowed email may create the one owner user', () => {
  const allowed = ['owner@example.com'];
  assert.equal(newUserProblem('OWNER@example.com', allowed, 0), null);
  assert.equal(newUserProblem('stranger@example.com', allowed, 0)?.reason, 'not_allowed');
  assert.match(newUserProblem('stranger@example.com', allowed, 0)?.message ?? '', /not allowed/);
  assert.equal(newUserProblem(null, allowed, 0)?.reason, 'not_allowed');
  assert.equal(newUserProblem('owner@example.com', allowed, 1)?.reason, 'second_user');
  assert.match(newUserProblem('owner@example.com', allowed, 1)?.message ?? '', /link this one/);
});

test('returnTo must be HTTPS on the root domain or one of its subdomains', () => {
  const fallback = 'https://auth.daysofme.com/account';
  const ok = (url: string) => assert.equal(safeReturnTo(url, 'daysofme.com', fallback), url, url);
  const no = (url: string | undefined) => assert.equal(safeReturnTo(url, 'daysofme.com', fallback), fallback, String(url));
  ok('https://workout-memo.daysofme.com/logs?a=1');
  ok('https://daysofme.com/');
  no(undefined);
  no('http://workout-memo.daysofme.com/');
  no('https://evil.com/');
  no('https://daysofme.com.evil.com/');
  no('https://evildaysofme.com/');
  no('https://user:pass@workout-memo.daysofme.com/');
  no('javascript:alert(1)');
  no('/relative');
});

test('each refusal code maps to its fixed message, any other code to the default', () => {
  assert.equal(refusalMessage(undefined), undefined);
  assert.equal(refusalMessage(''), undefined);
  assert.equal(refusalMessage('not_allowed'), REFUSALS.not_allowed);
  assert.equal(refusalMessage('second_user'), REFUSALS.second_user);
  for (const code of ['state_not_found', 'access_denied', '__proto__', 'constructor', '<b>x</b>']) assert.equal(refusalMessage(code), SIGN_IN_FAILED, code);
  for (const reason of Object.keys(REFUSALS)) assert.match(reason, /^[a-z_]+$/);
});
