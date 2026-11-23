// Starts a test server on a free port that fetch can reach.
import { createServer, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * The ports fetch refuses ("bad port", https://fetch.spec.whatwg.org/#port-blocking). listen(0) takes
 * a port from the OS's dynamic range, and on a machine whose range starts at 1024 instead of 49152
 * (Windows can be set that way) it sometimes lands on one of these, so a test failed with
 * "fetch failed: bad port" (#63). CI's Linux range (32768-60999) has none of them.
 */
export const FETCH_BLOCKED_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
  135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995,
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

const start = (server: Server) =>
  new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });

/** Listens on 127.0.0.1 on a random port that fetch allows, and returns the server and its base URL. */
export async function listen(handler: RequestListener): Promise<{ server: Server; base: string }> {
  for (;;) {
    const server = createServer(handler);
    const port = await start(server);
    if (!FETCH_BLOCKED_PORTS.has(port)) return { server, base: `http://127.0.0.1:${port}` };
    await new Promise((r) => server.close(r));
  }
}
