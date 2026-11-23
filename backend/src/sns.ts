// Publishes the alert to the shared SNS topic (project-standards#1091, shared-aws-infrastructure#105)
// with fetch and AWS Signature Version 4 from node:crypto, so no AWS SDK package is needed (#36, #61).
import { createHash, createHmac } from 'node:crypto';
import type { AlertSender } from './new-device.js';

export type SnsConfig = { region: string; accessKeyId: string; secretAccessKey: string; topicArn: string };

type SignInput = {
  method: string;
  host: string;
  path: string;
  /** Already encoded and sorted, without "?"; empty for none. */
  query: string;
  /** Lower-case names; host and x-amz-date are added. */
  headers: Record<string, string>;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
};

const sha256 = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();

/** Returns the headers to send, including x-amz-date and Authorization (AWS Signature Version 4). */
export function signV4(input: SignInput): Record<string, string> {
  const amzDate = input.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...input.headers, host: input.host, 'x-amz-date': amzDate };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const canonical = [
    input.method,
    input.path,
    input.query,
    names.map((n) => `${n}:${headers[n]!.trim()}\n`).join(''),
    signedHeaders,
    sha256(input.body),
  ].join('\n');
  const scope = `${date}/${input.region}/${input.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, date), input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
  const { host: _host, ...rest } = headers;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
}

/** An AlertSender that publishes the text to config.topicArn. Errors name the HTTP status only, never a key or the topic. */
export function snsSender(config: SnsConfig, subject: string, fetchImpl: typeof fetch = fetch): AlertSender {
  const host = `sns.${config.region}.amazonaws.com`;
  const path = '/';
  return async (text) => {
    const body = new URLSearchParams({ Action: 'Publish', Version: '2010-03-31', TopicArn: config.topicArn, Subject: subject, Message: text }).toString();
    const headers = signV4({
      method: 'POST',
      host,
      path,
      query: '',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body,
      region: config.region,
      service: 'sns',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      now: new Date(),
    });
    const r = await fetchImpl(`https://${host}${path}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`SNS Publish answered ${r.status}`);
  };
}

/** The SNS settings from the environment, or null (the alert is off) unless every key is set. */
export function snsConfigFrom(env: NodeJS.ProcessEnv): SnsConfig | null {
  const region = env.AWS_ALERT_REGION;
  const accessKeyId = env.AWS_ALERT_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_ALERT_SECRET_ACCESS_KEY;
  const topicArn = env.AWS_ALERT_TOPIC_ARN;
  if (!region || !accessKeyId || !secretAccessKey || !topicArn) return null;
  return { region, accessKeyId, secretAccessKey, topicArn };
}
