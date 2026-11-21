import type { Server } from 'node:http';

// On SIGTERM (docker compose stop or a deploy) stop taking requests, let open ones finish, close the
// database pool, and exit. Keep-alive sockets are closed as soon as they go idle, and a request that
// hangs longer than `graceMs` is cut off, so neither holds the container up.
export function closeGracefully(server: Server, closePool: () => Promise<void>, graceMs = 5000): Promise<void> {
  const sweep = setInterval(() => server.closeIdleConnections(), 50);
  const timer = setTimeout(() => server.closeAllConnections(), graceMs);
  return new Promise<void>((resolve) => server.close(() => resolve()))
    .finally(() => {
      clearInterval(sweep);
      clearTimeout(timer);
    })
    .then(closePool);
}
