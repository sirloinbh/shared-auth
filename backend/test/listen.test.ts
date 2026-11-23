import assert from 'node:assert/strict';
import test from 'node:test';
import { FETCH_BLOCKED_PORTS, listen } from './listen.js';

const refusal = async (port: number) => {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
    return 'answered';
  } catch (e) {
    return String((e as Error).cause ?? e).includes('bad port') ? 'bad port' : 'other';
  }
};

test('the blocked-port list matches what fetch refuses', async () => {
  for (const port of [5060, 6000, 6665, 6669, 10080]) {
    assert.ok(FETCH_BLOCKED_PORTS.has(port), String(port));
    assert.equal(await refusal(port), 'bad port', String(port));
  }
  for (const port of [6001, 6670, 10081]) {
    assert.ok(!FETCH_BLOCKED_PORTS.has(port), String(port));
    assert.notEqual(await refusal(port), 'bad port', String(port));
  }
});

test('listen gives a port fetch can reach', async () => {
  const { server, base } = await listen((_req, res) => res.end('ok'));
  try {
    assert.ok(!FETCH_BLOCKED_PORTS.has(Number(new URL(base).port)));
    assert.equal(await (await fetch(base)).text(), 'ok');
  } finally {
    server.close();
  }
});
