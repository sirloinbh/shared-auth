import assert from 'node:assert/strict';
import test from 'node:test';
import { accountPage, signInPage, signOutPage } from '../src/pages.js';
import { TOKENS_VERSION } from '../src/styles.js';

const pages = {
  'sign-in': signInPage('https://workout-memo.daysofme.com/'),
  account: accountPage({ name: 'Owner', email: 'owner@example.com' }, ['github']),
  'sign-out': signOutPage('https://workout-memo.daysofme.com/'),
};

test('every page uses the shared design token values in light and dark mode', () => {
  for (const [name, page] of Object.entries(pages)) {
    assert.match(page, /--background: oklch\(1 0 0\)/, name);
    assert.match(page, /--primary: oklch\(0\.205 0 0\)/, name);
    assert.match(page, /--radius: 0\.625rem/, name);
    assert.match(page, /"Pretendard Variable", Pretendard/, name);
    assert.match(page, /@media \(prefers-color-scheme: dark\)[\s\S]*--background: oklch\(0\.145 0 0\)/, name);
    assert.doesNotMatch(page, /#[0-9a-f]{6}\b/i, `${name} has a color outside the tokens`);
  }
});

test('the token copy names a released design-tokens version', () => {
  assert.match(TOKENS_VERSION, /^\d+\.\d+\.\d+$/);
});
