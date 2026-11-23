import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import express from 'express';
import { REQUEST_ID_PATTERN, requestLog } from '../src/request-log.js';
import { signInLine } from '../src/signin-log.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** An app with requestLog and three routes; returns what was logged to stdout and stderr. */
async function serve(t: TestContext, run: (base: string) => Promise<void>) {
  const out: string[] = [];
  const err: string[] = [];
  t.mock.method(console, 'log', (line: string) => void out.push(line));
  t.mock.method(console, 'error', (line: string) => void err.push(line));
  const app = express();
  app.use(requestLog);
  app.get('/ok', (req, res) => void res.json({ seen: req.headers['x-request-id'] }));
  app.get('/missing', (_req, res) => void res.status(404).end());
  app.get('/broken', (_req, res) => void res.status(500).end());
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
  return { out: out.map((l) => JSON.parse(l)), err: err.map((l) => JSON.parse(l)) };
}

test('a valid incoming X-Request-Id is kept, answered, logged, and passed on to the handlers', async (t) => {
  let seen: unknown;
  const { out } = await serve(t, async (base) => {
    const r = await fetch(`${base}/ok?code=secret-code&state=secret-state`, { headers: { 'x-request-id': 'app.req_1-2' } });
    assert.equal(r.headers.get('x-request-id'), 'app.req_1-2');
    seen = ((await r.json()) as { seen: unknown }).seen;
  });
  assert.equal(seen, 'app.req_1-2', 'Better Auth hooks read the same ID from the request headers');
  assert.equal(out.length, 1);
  const { time, ms, ...line } = out[0];
  assert.match(time, /^\d{4}-\d\d-\d\dT/);
  assert.equal(typeof ms, 'number');
  assert.deepEqual(line, { level: 'info', requestId: 'app.req_1-2', method: 'GET', path: '/ok', status: 200 });
  assert.doesNotMatch(JSON.stringify(out), /secret-code|secret-state/, 'no query string in the log');
});

test('a missing or invalid X-Request-Id is replaced with a new UUID', async (t) => {
  const ids: string[] = [];
  const { out } = await serve(t, async (base) => {
    for (const headers of [{}, { 'x-request-id': 'has space' }, { 'x-request-id': 'x'.repeat(129) }, { 'x-request-id': '{"level":"error"}' }]) {
      const r = await fetch(`${base}/ok`, { headers });
      ids.push(r.headers.get('x-request-id') ?? '');
      await r.arrayBuffer();
    }
  });
  for (const id of ids) assert.match(id, UUID);
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual(out.map((l) => l.requestId), ids);
});

test('4xx lines are warn on stdout and 5xx lines are error on stderr, so the daily report counts only 5xx', async (t) => {
  const { out, err } = await serve(t, async (base) => {
    await (await fetch(`${base}/missing`)).arrayBuffer();
    await (await fetch(`${base}/broken`)).arrayBuffer();
  });
  assert.deepEqual(out.map((l) => [l.level, l.status]), [['warn', 404]]);
  assert.deepEqual(err.map((l) => [l.level, l.status]), [['error', 500]]);
  assert.match(JSON.stringify(err[0]), /"level":"error"/, 'report.sh greps this exact text');
});

test('the request ID pattern matches the apps\' managed requestLog', () => {
  assert.equal(REQUEST_ID_PATTERN.source, '^[\\w.-]{1,128}$');
});

test('a sign_in line carries the request ID when there is one', () => {
  const line = JSON.parse(signInLine({ outcome: 'success', provider: 'github', userId: 'u1', ip: null, userAgent: null, requestId: 'app-req.1' }));
  assert.equal(line.requestId, 'app-req.1');
  assert.equal('requestId' in JSON.parse(signInLine({ outcome: 'success', provider: 'github', ip: null, userAgent: null })), false);
});
