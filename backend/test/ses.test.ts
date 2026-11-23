import assert from 'node:assert/strict';
import test from 'node:test';
import { sesConfigFrom, sesSender, signV4 } from '../src/ses.js';

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

const config = { region: 'ap-northeast-2', accessKeyId: 'AKIDTEST', secretAccessKey: 'secret-test', from: 'alerts@daysofme.com', to: 'owner@example.com' };

test('the sender posts one signed SendEmail request with the text', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const send = sesSender(config, 'New sign-in', async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return new Response('{}', { status: 200 });
  });
  await send('Sign-in from a new device: github');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://email.ap-northeast-2.amazonaws.com/v2/email/outbound-emails');
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.match(headers.authorization!, /^AWS4-HMAC-SHA256 Credential=AKIDTEST\/\d{8}\/ap-northeast-2\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.equal(body.FromEmailAddress, 'alerts@daysofme.com');
  assert.deepEqual(body.Destination.ToAddresses, ['owner@example.com']);
  assert.equal(body.Content.Simple.Subject.Data, 'New sign-in');
  assert.equal(body.Content.Simple.Body.Text.Data, 'Sign-in from a new device: github');
});

test('a refused request throws with the status only', async () => {
  const send = sesSender(config, 's', async () => new Response('{"message":"Email address is not verified: owner@example.com"}', { status: 400 }));
  await assert.rejects(send('x'), (err: Error) => err.message === 'SES SendEmail answered 400');
});

test('the alert is off unless every SES key is set', () => {
  const full = { SES_REGION: 'ap-northeast-2', SES_ACCESS_KEY_ID: 'a', SES_SECRET_ACCESS_KEY: 'b', SIGNIN_ALERT_EMAIL_FROM: 'f@x.com', SIGNIN_ALERT_EMAIL_TO: 't@x.com' };
  assert.deepEqual(sesConfigFrom(full), { region: 'ap-northeast-2', accessKeyId: 'a', secretAccessKey: 'b', from: 'f@x.com', to: 't@x.com' });
  for (const key of Object.keys(full)) assert.equal(sesConfigFrom({ ...full, [key]: '' }), null, key);
  assert.equal(sesConfigFrom({}), null);
});
