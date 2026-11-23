import pg from 'pg';
import { createApp } from './app.js';
import { createAuth, revokeRemovedUsers } from './auth.js';
import { loadConfig } from './config.js';
import { alertErrorLine, newDeviceWatcher, pgSeenStore } from './new-device.js';
import { closeGracefully } from './shutdown.js';
import { consoleSignInLog } from './signin-log.js';

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const countUsers = async () => Number((await pool.query<{ n: string }>('select count(*) as n from "user"')).rows[0]?.n ?? 0);
// The new device alert (#36): sign-ins are remembered always; the alert is sent once its channel is set.
const watchDevices = newDeviceWatcher({ store: pgSeenStore(pool), send: null, onError: (err) => console.error(alertErrorLine(err)) });
const auth = createAuth(config, pool, countUsers, (event) => {
  consoleSignInLog(event);
  void watchDevices(event);
});
const app = createApp(auth, { baseURL: config.baseURL, rootDomain: config.rootDomain, ping: async () => void (await pool.query('select 1')) });

const revoked = await revokeRemovedUsers(auth, config.allowedEmails);
if (revoked) console.log(`signed out ${revoked} user(s) no longer in ALLOWED_EMAILS`);

const server = app.listen(config.port, () => console.log(`auth http://localhost:${config.port}`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    closeGracefully(server, () => pool.end()).then(
      () => process.exit(0),
      (err: unknown) => {
        console.error('shutdown failed', err);
        process.exit(1);
      },
    );
  });
}
