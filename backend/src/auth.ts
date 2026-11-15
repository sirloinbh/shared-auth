// The Better Auth instance: GitHub and Google, one owner, one session cookie for every app subdomain
// (ADR-0015 in sirloinbh/project-standards).
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { newUserProblem } from './rules.js';

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

export function authOptions(config: AuthConfig, database: BetterAuthOptions['database'], countUsers: () => Promise<number>): BetterAuthOptions {
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
            if (problem) throw new APIError('FORBIDDEN', { message: problem });
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
  return betterAuth(authOptions(config, database, countUsers));
}

export type Auth = ReturnType<typeof createAuth>;
