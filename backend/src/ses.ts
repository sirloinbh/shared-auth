// Sends a plain-text email through Amazon SES (API v2 SendEmail) with fetch and AWS Signature
// Version 4 from node:crypto, so no AWS SDK package is needed (#36).
import { createHash, createHmac } from 'node:crypto';
import type { AlertSender } from './new-device.js';

export type SesConfig = { region: string; accessKeyId: string; secretAccessKey: string; from: string; to: string };

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

/** An AlertSender that emails the text to config.to. Errors name the HTTP status only, never a key or address. */
export function sesSender(config: SesConfig, subject: string, fetchImpl: typeof fetch = fetch): AlertSender {
  const host = `email.${config.region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  return async (text) => {
    const body = JSON.stringify({
      FromEmailAddress: config.from,
      Destination: { ToAddresses: [config.to] },
      Content: { Simple: { Subject: { Data: subject, Charset: 'UTF-8' }, Body: { Text: { Data: text, Charset: 'UTF-8' } } } },
    });
    const headers = signV4({
      method: 'POST',
      host,
      path,
      query: '',
      headers: { 'content-type': 'application/json' },
      body,
      region: config.region,
      service: 'ses',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      now: new Date(),
    });
    const r = await fetchImpl(`https://${host}${path}`, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`SES SendEmail answered ${r.status}`);
  };
}

/** The SES settings from the environment, or null (the alert is off) unless every key is set. */
export function sesConfigFrom(env: NodeJS.ProcessEnv): SesConfig | null {
  const region = env.SES_REGION;
  const accessKeyId = env.SES_ACCESS_KEY_ID;
  const secretAccessKey = env.SES_SECRET_ACCESS_KEY;
  const from = env.SIGNIN_ALERT_EMAIL_FROM;
  const to = env.SIGNIN_ALERT_EMAIL_TO;
  if (!region || !accessKeyId || !secretAccessKey || !from || !to) return null;
  return { region, accessKeyId, secretAccessKey, from, to };
}
