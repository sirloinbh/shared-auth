import assert from 'node:assert/strict';
import test from 'node:test';
import { memorySeenStore, newDeviceWatcher } from '../src/new-device.js';
import { signV4, snsConfigFrom, snsSender } from '../src/sns.js';

test('signV4 matches the AWS documentation example (IAM ListUsers, 2015-08-30)', () => {
  const headers = signV4({
    method: 'GET',
    host: 'iam.amazonaws.com',
    path: '/',
    query: 'Action=ListUsers&Version=2010-05-08',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body: '',
    region: 'us-east-1',
    service: 'iam',
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    now: new Date('2015-08-30T12:36:00Z'),
  });
  assert.equal(headers['x-amz-date'], '20150830T123600Z');
  assert.equal(
    headers.authorization,
    'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7',
  );
});

const config = { region: 'ap-northeast-2', accessKeyId: 'AKIDTEST', secretAccessKey: 'secret-test', topicArn: 'arn:aws:sns:ap-northeast-2:123456789012:alerts' };

test('the sender posts one signed SNS Publish request with the text', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const send = snsSender(config, 'New sign-in', async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return new Response('<PublishResponse/>', { status: 200 });
  });
  await send('Sign-in from a new device: github & co');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://sns.ap-northeast-2.amazonaws.com/');
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.match(headers.authorization!, /^AWS4-HMAC-SHA256 Credential=AKIDTEST\/\d{8}\/ap-northeast-2\/sns\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
  const body = new URLSearchParams(String(calls[0]!.init.body));
  assert.equal(body.get('Action'), 'Publish');
  assert.equal(body.get('Version'), '2010-03-31');
  assert.equal(body.get('TopicArn'), config.topicArn);
  assert.equal(body.get('Subject'), 'New sign-in');
  assert.equal(body.get('Message'), 'Sign-in from a new device: github & co');
});

test('a refused request throws with the status only', async () => {
  const send = snsSender(config, 's', async () => new Response('<Error><Message>User: arn:aws:iam::123456789012:user/x is not authorized</Message></Error>', { status: 403 }));
  await assert.rejects(send('x'), (err: Error) => err.message === 'SNS Publish answered 403');
});

test('the alert is off unless every SNS key is set', () => {
  const full = { AWS_ALERT_REGION: 'ap-northeast-2', AWS_ALERT_ACCESS_KEY_ID: 'a', AWS_ALERT_SECRET_ACCESS_KEY: 'b', AWS_ALERT_TOPIC_ARN: 'arn:aws:sns:ap-northeast-2:1:t' };
  assert.deepEqual(snsConfigFrom(full), { region: 'ap-northeast-2', accessKeyId: 'a', secretAccessKey: 'b', topicArn: 'arn:aws:sns:ap-northeast-2:1:t' });
  for (const key of Object.keys(full)) assert.equal(snsConfigFrom({ ...full, [key]: '' }), null, key);
  assert.equal(snsConfigFrom({}), null);
  // The old SES keys no longer turn anything on.
  assert.equal(snsConfigFrom({ SES_REGION: 'x', SES_ACCESS_KEY_ID: 'a', SES_SECRET_ACCESS_KEY: 'b', SIGNIN_ALERT_EMAIL_FROM: 'f', SIGNIN_ALERT_EMAIL_TO: 't' }), null);
});

test('a new device publishes one SNS message and a known one none', async () => {
  let published = 0;
  const send = snsSender(config, 'New sign-in', async () => {
    published += 1;
    return new Response('<PublishResponse/>', { status: 200 });
  });
  const errors: unknown[] = [];
  const watch = newDeviceWatcher({ store: memorySeenStore(), send, onError: (e) => errors.push(e) });
  const event = { outcome: 'success', provider: 'github', userId: 'owner', ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Chrome/131.0.0.0' } as const;
  await watch(event);
  await watch(event);
  assert.equal(published, 1);
  assert.deepEqual(errors, []);
});
