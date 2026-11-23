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
  if (!isAllowedEmail(email, allowed)) return { reason: 'not_allowed', message: REFUSALS.not_allowed };
  if (existingUsers > 0) return { reason: 'second_user', message: REFUSALS.second_user };
  return null;
}

/**
 * Why a sign-in was refused, and the message the sign-in page shows for it. The reason is the error
 * code Better Auth puts in the error callback URL (/sign-in?error=<reason>), so it must stay URL-safe.
 */
export const REFUSALS = {
  not_allowed: 'This account is not allowed to sign in.',
  second_user: 'Sign in with the account you used first, then link this one on the account page.',
} as const;

export type RefusalReason = keyof typeof REFUSALS;

export const NOT_ALLOWED = REFUSALS.not_allowed;

/** Shown for any other error code: Better Auth's own (state_not_found, access_denied, ...) or a made-up one. */
export const SIGN_IN_FAILED = 'Sign-in did not finish. Try again, and use an allowed account.';

/** The fixed message for an error code from the callback URL; the code itself is never shown. */
export function refusalMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return Object.hasOwn(REFUSALS, code) ? REFUSALS[code as RefusalReason] : SIGN_IN_FAILED;
}

/**
 * Messages for a failed link on /account (/account?error=<code>). The codes are Better Auth's own OAuth
 * callback codes; any other code shows the default, and the code itself is never shown.
 */
const LINK_ERRORS: Record<string, string> = {
  account_already_linked_to_different_user: 'That account is already linked to another user.',
};

export const LINK_FAILED = 'Linking did not finish. Try again.';

/** The fixed message for a failed link, or nothing when there is no error code. */
export function linkErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return Object.hasOwn(LINK_ERRORS, code) ? LINK_ERRORS[code] : LINK_FAILED;
}

/** Why a new user was refused: not in ALLOWED_EMAILS, or allowed but not the first (the one owner). */
export type NewUserProblem = { reason: RefusalReason; message: string };

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
