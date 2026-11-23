// Renews the browser's session cookie when the owner opens the auth pages (#48).
//
// The cookie gets its lifetime once, at sign-in. Afterwards the apps check the session server-to-server
// (@sirloinbh/auth-client), and Better Auth moves the session's expiry forward in the database on those
// calls, but the refreshed cookie it sends back never reaches the browser. By the time the browser opens
// /account itself, the row already looks fresh, so Better Auth sends no cookie either. So this sends the
// cookie the browser already has (the same signed value) again, with a lifetime that ends when the
// session in the database ends.
import type { Response } from 'express';

export type CookieShape = {
  name: string;
  attributes: { path?: string; domain?: string; secure?: boolean; httpOnly?: boolean; sameSite?: string | boolean };
};

/**
 * The raw value (still URL-encoded) of the cookie `name` that carries `token`. A browser can send two
 * cookies with one name (for example one on daysofme.com and one on this host), so only the one Better
 * Auth accepted, whose value is `<token>.<signature>`, is renewed.
 */
export function cookieValue(header: string | undefined, name: string, token: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0 || part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    let decoded: string;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      continue;
    }
    if (decoded.startsWith(`${token}.`)) return value;
  }
  return null;
}

/** A Set-Cookie line for the session's cookie that lasts until the session ends, or null when there is nothing to renew. */
export function renewedCookie(cookie: CookieShape, header: string | undefined, session: { token: string; expiresAt: Date }, now = Date.now()): string | null {
  const value = cookieValue(header, cookie.name, session.token);
  const expiresAt = session.expiresAt;
  const maxAge = Math.floor((expiresAt.getTime() - now) / 1000);
  if (!value || maxAge <= 0) return null;
  const a = cookie.attributes;
  const sameSite = typeof a.sameSite === 'string' ? a.sameSite[0]!.toUpperCase() + a.sameSite.slice(1).toLowerCase() : a.sameSite ? 'Strict' : null;
  return [
    `${cookie.name}=${value}`,
    `Max-Age=${maxAge}`,
    `Expires=${new Date(now + maxAge * 1000).toUTCString()}`,
    `Path=${a.path ?? '/'}`,
    a.domain ? `Domain=${a.domain}` : null,
    a.httpOnly ? 'HttpOnly' : null,
    a.secure ? 'Secure' : null,
    sameSite ? `SameSite=${sameSite}` : null,
  ]
    .filter(Boolean)
    .join('; ');
}

/** Adds the renewed session cookie to the response, when the request carried one. */
export function renewSessionCookie(res: Response, cookie: CookieShape, header: string | undefined, session: { token: string; expiresAt: Date | string }): void {
  const line = renewedCookie(cookie, header, { token: session.token, expiresAt: new Date(session.expiresAt) });
  if (line) res.append('Set-Cookie', line);
}
