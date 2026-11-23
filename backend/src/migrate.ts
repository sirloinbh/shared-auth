// Creates or updates Better Auth's tables (user, session, account, verification) and sign_in_seen before the server starts.
// Uses Better Auth's own migration code instead of its CLI, so no npx is needed.
import { getMigrations } from 'better-auth/db/migration';
import pg from 'pg';
import { authOptions } from './auth.js';
import { loadConfig } from './config.js';
import { SEEN_TABLE_SQL } from './new-device.js';

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 });
try {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(authOptions(config, pool, async () => 0, async () => null));
  await runMigrations();
  // The IPs and devices of earlier sign-ins (#36), outside Better Auth's schema.
  await pool.query(SEEN_TABLE_SQL);
  console.log(`migrate: ${toBeCreated.length} tables created, ${toBeAdded.length} tables changed`);
} finally {
  await pool.end();
}
