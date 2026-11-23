// The Better Auth instance: GitHub and Google, one owner, one session cookie for every app subdomain
// (ADR-0015 in sirloinbh/project-standards).
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { isAllowedEmail, newUserProblem } from './rules.js';

export type AuthConfig = {
  /** https://auth.<root domain> */
  baseURL: string;
  rootDomain: string;
  secret: string;
  allowedEmails: string[];
  github: { clientId: string; clientSecret: string };
  google: { clientId: string; clientSecret: string };
  /** Secure cookies and the parent-domain cookie are for the real HTTPS address only. */
  production: boolean;
};

const DAY = 24 * 60 * 60;

/**
 * Session settings (seconds), written out instead of left to Better Auth's defaults (#39).
 * - expiresIn: the browser's session cookie is set once at sign-in with this lifetime. Apps check the
 *   session server-to-server and do not pass refreshed cookies back to the browser, so in practice the
 *   owner signs in again after this long.
 * - updateAge: a session used after this long gets its database expiry moved forward.
 * - cookieCache: off. It would only save database reads for its maxAge after sign-in (the apps never
 *   hand the refreshed cache cookie to the browser), it would keep a revoked session usable for that
 *   long, and @sirloinbh/auth-client already caches each successful check for 30 seconds.
 */
export const SESSION = { expiresIn: 30 * DAY, updateAge: DAY, cookieCache: { enabled: false } } as const;

/**
 * The header with the client IP. The server's nginx sets X-Real-IP to the address it accepted the
 * connection from, replacing any value the client sent. X-Forwarded-For is not used: nginx appends to
 * what the client sent, so its first entry can be forged. Only nginx and the app containers on the
 * shared-auth Docker network can reach the API (the port is published on 127.0.0.1).
 */
export const CLIENT_IP_HEADER = 'x-real-ip';

/**
 * Request limits per client IP and path (#37). Better Auth counts in memory, which fits the one API
 * container; a restart clears the counts. Paths are relative to /api/auth.
 */
export const RATE_LIMIT = {
  window: 60,
  max: 100,
  rules: {
    // Starting a GitHub or Google sign-in, linking the other one, and the provider callbacks.
    '/sign-in/*': { window: 60, max: 10 },
    '/link-social': { window: 60, max: 10 },
    '/callback/*': { window: 60, max: 10 },
  },
} as const;

/**
 * App APIs check sessions server-to-server over the Docker network (@sirloinbh/auth-client), without
 * X-Real-IP. Those calls would all share one count, so one busy app could lock every app out; they are
 * not limited. A request through nginx always has X-Real-IP, so a browser cannot skip the limit.
 */
const internalSessionCheck = (request: Request, rule: { window: number; max: number }) =>
  request.headers.get(CLIENT_IP_HEADER) ? rule : (false as const);

/**
 * A refusal from a hook. The OAuth callback redirects to the errorCallbackURL (/sign-in?error=...) only
 * when the error has a code; without one the browser would get a bare 403.
 */
const refused = (message: string) => new APIError('FORBIDDEN', { code: 'SIGN_IN_REFUSED', message });

/** Looks up a user's email by user id; null when the user does not exist. */
export type FindUserEmail = (userId: string) => Promise<string | null>;

export function authOptions(
  config: AuthConfig,
  database: BetterAuthOptions['database'],
  countUsers: () => Promise<number>,
  findUserEmail: FindUserEmail,
): BetterAuthOptions {
  return {
    appName: 'daysofme sign-in',
    baseURL: config.baseURL,
    secret: config.secret,
    database,
    session: { expiresIn: SESSION.expiresIn, updateAge: SESSION.updateAge, cookieCache: { ...SESSION.cookieCache } },
    // Sign-in is only through GitHub or Google; there are no passwords.
    emailAndPassword: { enabled: false },
    socialProviders: {
      github: { clientId: config.github.clientId, clientSecret: config.github.clientSecret },
      google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret },
    },
    account: {
      // The owner's GitHub and Google emails differ, so the second provider is linked explicitly from /account.
      accountLinking: { enabled: true, trustedProviders: ['github', 'google'], allowDifferentEmails: true },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const problem = newUserProblem(user.email, config.allowedEmails, await countUsers());
            if (problem) throw refused(problem);
          },
        },
      },
      session: {
        create: {
          // ALLOWED_EMAILS is checked again at every sign-in, so removing an email locks that user out.
          before: async (session) => {
            if (!isAllowedEmail(await findUserEmail(session.userId), config.allowedEmails)) {
              throw refused('This account is not allowed to sign in.');
            }
          },
        },
      },
    },
    // Callbacks may return to this service or any app under the root domain.
    trustedOrigins: [config.baseURL, `https://*.${config.rootDomain}`],
    rateLimit: {
      enabled: true,
      storage: 'memory',
      window: RATE_LIMIT.window,
      max: RATE_LIMIT.max,
      customRules: { ...RATE_LIMIT.rules, '/get-session': internalSessionCheck },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      // @sirloinbh/auth-client reads (__Secure-)sirloinbh.session_token.
      cookiePrefix: 'sirloinbh',
      useSecureCookies: config.production,
      crossSubDomainCookies: { enabled: config.production, domain: config.rootDomain },
    },
    telemetry: { enabled: false },
  };
}

export function createAuth(config: AuthConfig, database: BetterAuthOptions['database'], countUsers: () => Promise<number>) {
  const findUserEmail: FindUserEmail = async (userId) => (await (await auth.$context).internalAdapter.findUserById(userId))?.email ?? null;
  const auth = betterAuth(authOptions(config, database, countUsers, findUserEmail));
  return auth;
}

/**
 * Deletes the sessions of users whose email is no longer in ALLOWED_EMAILS. Run on start: changing
 * ALLOWED_EMAILS needs a restart, so a removed email loses its open sessions with that restart.
 * Returns how many users lost their sessions.
 */
export async function revokeRemovedUsers(auth: Auth, allowedEmails: string[]): Promise<number> {
  const { internalAdapter } = await auth.$context;
  const removed = (await internalAdapter.listUsers()).filter((u) => !isAllowedEmail(u.email, allowedEmails));
  for (const user of removed) await internalAdapter.deleteUserSessions(user.id);
  return removed.length;
}

export type Auth = ReturnType<typeof createAuth>;
