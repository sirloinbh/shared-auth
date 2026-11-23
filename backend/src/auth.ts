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
    advanced: {
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
