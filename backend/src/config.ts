import type { AuthConfig } from './auth.js';
import { parseAllowedEmails } from './rules.js';

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key];
  if (!value) throw new Error(`${key} is not set (see .env.example)`);
  return value;
};

/** Reads the service settings from the environment. Every key is listed in .env.example. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig & { databaseUrl: string; port: number } {
  const allowedEmails = parseAllowedEmails(env.ALLOWED_EMAILS);
  if (!allowedEmails.length) throw new Error('ALLOWED_EMAILS is empty, so nobody could sign in');
  return {
    baseURL: required(env, 'BETTER_AUTH_URL'),
    rootDomain: required(env, 'ROOT_DOMAIN'),
    secret: required(env, 'BETTER_AUTH_SECRET'),
    allowedEmails,
    github: { clientId: required(env, 'GITHUB_CLIENT_ID'), clientSecret: required(env, 'GITHUB_CLIENT_SECRET') },
    google: { clientId: required(env, 'GOOGLE_CLIENT_ID'), clientSecret: required(env, 'GOOGLE_CLIENT_SECRET') },
    production: env.NODE_ENV === 'production',
    databaseUrl: required(env, 'DATABASE_URL'),
    port: Number(env.PORT ?? 3110),
  };
}
