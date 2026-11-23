import assert from 'node:assert/strict';
import test from 'node:test';
import { newUserProblem, parseAllowedEmails, safeReturnTo } from '../src/rules.js';

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
