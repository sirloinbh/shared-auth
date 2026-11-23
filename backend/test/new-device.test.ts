import assert from 'node:assert/strict';
import test from 'node:test';
import { alertErrorLine, deviceOf, memorySeenStore, newDeviceWatcher } from '../src/new-device.js';
import type { SignInEvent } from '../src/signin-log.js';

const CHROME_131 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const CHROME_132 = CHROME_131.replace('131.0.0.0', '132.0.6834.83');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1';

const success = (ip: string | null, userAgent: string | null, userId = 'owner'): SignInEvent => ({ outcome: 'success', provider: 'github', userId, ip, userAgent });

function watcher(send: ((text: string) => Promise<void>) | null = null) {
  const sent: string[] = [];
  const errors: unknown[] = [];
  const store = memorySeenStore();
  const fake = async (text: string) => void sent.push(text);
  return { sent, errors, store, watch: newDeviceWatcher({ store, send: send === null ? fake : send, onError: (e) => errors.push(e) }) };
}

test('a new device sends one alert and a known one sends none', async () => {
  const { sent, watch } = watcher();
  await watch(success('203.0.113.7', CHROME_131));
  assert.equal(sent.length, 1);
  assert.match(sent[0]!, /new IP and device: github, IP 203\.0\.113\.7, Mozilla/);
  await watch(success('203.0.113.7', CHROME_131));
  await watch(success('203.0.113.7', CHROME_132)); // a browser update is the same device
  assert.equal(sent.length, 1);
  await watch(success('203.0.113.7', IPHONE));
  assert.equal(sent.length, 2);
  assert.match(sent[1]!, /new device:/);
  await watch(success('198.51.100.4', IPHONE));
  assert.equal(sent.length, 3);
  assert.match(sent[2]!, /new IP:/);
});

test('refusals and other users are not mixed into the owner\'s devices', async () => {
  const { sent, watch } = watcher();
  await watch({ outcome: 'refused_not_allowed', provider: 'github', email: 's***@example.com', ip: '203.0.113.7', userAgent: CHROME_131 });
  assert.equal(sent.length, 0);
  await watch(success('203.0.113.7', CHROME_131, 'owner'));
  await watch(success('203.0.113.7', CHROME_131, 'other'));
  assert.equal(sent.length, 2);
});

test('without a channel nothing is sent, but sign-ins are remembered for when it is turned on', async () => {
  const errors: unknown[] = [];
  const store = memorySeenStore();
  await newDeviceWatcher({ store, send: null, onError: (e) => errors.push(e) })(success('203.0.113.7', CHROME_131));
  const sent: string[] = [];
  const on = newDeviceWatcher({ store, send: async (t) => void sent.push(t), onError: (e) => errors.push(e) });
  await on(success('203.0.113.7', CHROME_131));
  assert.deepEqual(sent, []);
  assert.deepEqual(errors, []);
});

test('a failing channel is reported, never thrown into the sign-in', async () => {
  const errors: unknown[] = [];
  const watch = newDeviceWatcher({ store: memorySeenStore(), send: async () => Promise.reject(new Error('channel down')), onError: (e) => errors.push(e) });
  await watch(success('203.0.113.7', CHROME_131));
  assert.equal(errors.length, 1);
  const line = JSON.parse(alertErrorLine(errors[0]));
  assert.equal(line.level, 'error');
  assert.equal(line.event, 'sign_in_alert_failed');
  assert.equal(line.error, 'channel down');
});

test('the device drops version numbers only', () => {
  assert.equal(deviceOf(CHROME_131), deviceOf(CHROME_132));
  assert.notEqual(deviceOf(CHROME_131), deviceOf(IPHONE));
  assert.equal(deviceOf(null), null);
});
