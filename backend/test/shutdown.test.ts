import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { closeGracefully } from '../src/shutdown.js';

async function listen(handler: Parameters<typeof createServer>[1]) {
  const server = createServer(handler);
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test('closes the server after an idle keep-alive connection and then the pool', async () => {
  const { server, base } = await listen((_req, res) => res.end('ok'));
  assert.equal(await (await fetch(base)).text(), 'ok'); // leaves an idle keep-alive socket open
  const order: string[] = [];
  const started = Date.now();
  await closeGracefully(server, async () => void order.push('pool'));
  order.push('done');
  assert.deepEqual(order, ['pool', 'done']);
  assert.equal(server.listening, false);
  assert.ok(Date.now() - started < 1000, 'idle connections must not delay the shutdown');
});

test('lets an open request finish before closing', async () => {
  const { server, base } = await listen((_req, res) => setTimeout(() => res.end('late'), 200));
  const pending = fetch(base).then((r) => r.text());
  await new Promise((r) => setTimeout(r, 50));
  let poolClosed = false;
  await closeGracefully(server, async () => void (poolClosed = true));
  assert.equal(await pending, 'late');
  assert.equal(poolClosed, true);
});

test('drops a request that outlives the grace period', async () => {
  const { server, base } = await listen(() => {}); // never answers
  const pending = fetch(base).then(
    () => 'answered',
    () => 'dropped',
  );
  await new Promise((r) => setTimeout(r, 50));
  const started = Date.now();
  await closeGracefully(server, async () => {}, 100);
  assert.ok(Date.now() - started < 1000);
  assert.equal(await pending, 'dropped');
});
