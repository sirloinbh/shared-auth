// Who may sign in, and where the browser may be sent afterwards (ADR-0015 in sirloinbh/project-standards).

/** Parses ALLOWED_EMAILS ("a@x.com,b@y.com") into lowercase addresses. */
export function parseAllowedEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** True when the email is in ALLOWED_EMAILS (case ignored). */
export function isAllowedEmail(email: string | null | undefined, allowed: string[]): boolean {
  return !!email && allowed.includes(email.toLowerCase());
}

/**
 * Decides whether a new user may be created. There is one owner: the first allowed sign-in creates
 * that user, and the other provider is linked from /account instead of creating a second user.
 */
export function newUserProblem(email: string | null | undefined, allowed: string[], existingUsers: number): NewUserProblem | null {
  if (!isAllowedEmail(email, allowed)) return { reason: 'not_allowed', message: NOT_ALLOWED };
  if (existingUsers > 0) return { reason: 'second_user', message: 'Sign in with the account you used first, then link this one on the account page.' };
  return null;
}

export const NOT_ALLOWED = 'This account is not allowed to sign in.';

/** Why a new user was refused: not in ALLOWED_EMAILS, or allowed but not the first (the one owner). */
export type NewUserProblem = { reason: 'not_allowed' | 'second_user'; message: string };

/** Returns returnTo when it is this service or an app under the root domain over HTTPS, otherwise the fallback. */
export function safeReturnTo(returnTo: string | undefined, rootDomain: string, fallback: string): string {
  if (!returnTo) return fallback;
  let url: URL;
  try {
    url = new URL(returnTo);
  } catch {
    return fallback;
  }
  const host = url.hostname.toLowerCase();
  const inDomain = host === rootDomain || host.endsWith(`.${rootDomain}`);
  return url.protocol === 'https:' && inDomain && !url.username && !url.password ? url.toString() : fallback;
}
