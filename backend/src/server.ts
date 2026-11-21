import pg from 'pg';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { loadConfig } from './config.js';
import { closeGracefully } from './shutdown.js';

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const countUsers = async () => Number((await pool.query<{ n: string }>('select count(*) as n from "user"')).rows[0]?.n ?? 0);
const auth = createAuth(config, pool, countUsers);
const app = createApp(auth, { baseURL: config.baseURL, rootDomain: config.rootDomain, ping: async () => void (await pool.query('select 1')) });

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
