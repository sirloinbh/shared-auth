# #39 Set the session lifetime and cookie cache explicitly

Issue: https://github.com/sirloinbh/shared-auth/issues/39

## Purpose

`backend/src/auth.ts` left the session lifetime, the refresh interval, and the cookie cache at Better Auth's defaults. Writing them out makes the behavior predictable and documents why each value was chosen.

## Changes

- `backend/src/auth.ts`: `SESSION` (`expiresIn` 30 days, `updateAge` 1 day, `cookieCache` off), passed as `session` in the auth options.
- `backend/test/app.test.ts`: checks the values Better Auth uses, a new session's expiry, and the session cookie's `maxAge`.
- `README.md`: a "Sessions" table.

## Why these values

- `@sirloinbh/auth-client` calls `get-session` server-to-server and does not relay `Set-Cookie` to the browser, and `backend/src/app.ts` does not either. So the browser cookie keeps the lifetime it got at sign-in, and the cookie cache (a `session_data` cookie with a 5-minute `maxAge`) would only help for 5 minutes after sign-in.
- The cookie cache is therefore off: it saves almost nothing and would keep a revoked session usable until it expires. auth-client's own 30-second cache already limits the database reads.
- `expiresIn` is 30 days instead of Better Auth's 7, because the refresh never reaches the browser: with 7 days the owner would sign in again every week. Sign-out ends the session at once, and #35 deletes the sessions of a removed email on restart.
- Follow-up #48: renew the browser cookie when the owner opens `/account` or `/sign-in`.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 16 passed, 0 failed.

## Limits and follow-up

- #48 (renewing the browser cookie).
