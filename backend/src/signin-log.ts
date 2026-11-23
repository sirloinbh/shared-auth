// One JSON line per sign-in outcome (#33), in the request log shape of project-standards docs/logging.md:
// time, level, event, then the fields below. Never a token, a cookie, or a refused account's full email.

export type SignInOutcome = 'success' | 'refused_not_allowed' | 'refused_second_user';

export type SignInEvent = {
  outcome: SignInOutcome;
  /** github or google; "unknown" when the sign-in did not come through an OAuth callback. */
  provider: string;
  /** The user id, when the user exists (a success, or a refused session of a removed email). */
  userId?: string;
  /** The masked email of an account refused before a user existed (maskEmail). */
  email?: string;
  ip: string | null;
  userAgent: string | null;
};

export type SignInLog = (event: SignInEvent) => void;

/** "owner@example.com" -> "o***@example.com": enough to tell accounts apart, not enough to read the address. */
export function maskEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at).toLowerCase()}`;
}

/** The log line for one event. A success is "info"; a refusal is "warn", so the daily error count ignores it. */
export function signInLine(event: SignInEvent, now = new Date()): string {
  const { outcome, provider, userId, email, ip, userAgent } = event;
  return JSON.stringify({
    time: now.toISOString(),
    level: outcome === 'success' ? 'info' : 'warn',
    event: 'sign_in',
    outcome,
    provider,
    ...(userId ? { userId } : {}),
    ...(email ? { email } : {}),
    ip: ip || null,
    // A user agent is client text; cap it so one request cannot write a huge line.
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  });
}

/** Writes the line to stdout, next to the other info and warn lines. */
export const consoleSignInLog: SignInLog = (event) => console.log(signInLine(event));
