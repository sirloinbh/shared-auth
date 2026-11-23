# #48 Renew the browser's session cookie when the owner opens the auth pages

Issue: https://github.com/sirloinbh/shared-auth/issues/48

## Purpose

The session cookie got its 30-day lifetime once, at sign-in (#39). The apps' server-to-server session checks move the database expiry forward, but the refreshed cookie never reaches the browser, so the browser cookie still ended 30 days after sign-in.

## Why not just forward Better Auth's Set-Cookie

The issue suggested `getSession({ returnHeaders: true })` and forwarding its `Set-Cookie`. That only sends a cookie when Better Auth refreshes the row itself, which happens when the row is at least `updateAge` (1 day) old (`better-auth/dist/api/routes/session.mjs`). An owner who uses the apps daily keeps the row fresh through the apps' checks, so a visit to `/account` would almost never get a cookie. Instead, the auth pages send the cookie the browser already has (the same signed value) again, with `Max-Age` set to the time left on the database session.

## Changes

- `backend/src/session-cookie.ts`: reads the session cookie that carries the token Better Auth just accepted (a browser can send two cookies with one name; review round 1), and builds the `Set-Cookie` line with the name and attributes Better Auth uses (`authCookies.sessionToken`: path, domain on `daysofme.com` in production, `HttpOnly`, `Secure`, `SameSite=Lax`). Nothing is sent without a valid session or after the session ended.
- `backend/src/app.ts`: `/account`, and `/sign-in` when signed in (before the redirect back to the app), renew the cookie after `getSession` confirmed the session.
- `backend/test/session-cookie.test.ts`: the line format; a session whose database expiry moved on gets a cookie with the same value and the remaining lifetime on `/account` and on `/sign-in`; a forged cookie gets nothing.
- `README.md`: the `expiresIn` row in "Sessions".

## Verification

- `npm run typecheck`: passed.
- `npm test`: 62 passed, 0 failed.
- Mutation check: without the renewal on `/account`, the route test fails.
- Not run: a real browser on the server.

## Limits

- The cookie is renewed only when the owner opens an auth page. A session check from an app still cannot renew it, because the browser never talks to the auth service on those requests.
