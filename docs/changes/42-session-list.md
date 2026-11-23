# #42 List active sessions and sign out other devices on the account page

Issue: https://github.com/sirloinbh/shared-auth/issues/42

## Purpose

If a device was lost, there was no way to end its session short of changing the auth secret. The account page now lists the active sessions and can sign out any other device.

## Changes

- `backend/src/app.ts`: `/account` reads the owner's active sessions through Better Auth's adapter and passes them to the page, newest use first. A new `POST /account/sessions/revoke` takes a session id, checks the Origin (as Better Auth does for its own POSTs) and the owner, refuses the current session, and calls Better Auth's `revokeSession` with the token it looked up.
- `backend/src/devices.ts` (new): `describeDevice()` names a session "Chrome on Windows" from its user agent.
- `backend/src/pages.ts`: an "Active sessions" list with device, IP, sign-in and last-use time (Seoul), a "This device" badge, a "Sign out" button per other session, and "Sign out other devices" (Better Auth's `revoke-other-sessions`) when two or more others exist.
- `backend/src/styles.ts`: two-line list rows; badges and buttons do not wrap.
- `backend/test/github.ts` (new): the mocked GitHub sign-in moved out of `signin-log.test.ts` so `account.test.ts` can sign in from several devices.
- `backend/test/account.test.ts` (new): the list and the "This device" mark, no token in the page, a revoked session no longer passes `get-session` while this one does, the route's refusals (no or foreign Origin 403, no session 401, this session 400, unknown id 404), "Sign out other devices", and device names.
- `README.md`: the session list and the new route.

## Choices

- Sessions are listed through the adapter, not Better Auth's `list-sessions` endpoint: that endpoint needs a "fresh" session (younger than `freshAge`, 1 day by default), and sessions last 30 days (#39), so it would fail on most visits.
- One session is signed out by id through this service's own route, instead of putting each session's token in the page for Better Auth's `revoke-session`. The token is the session's secret part; it stays on the server.
- Times are shown in Seoul time, where the owner and the server's timers are.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 39 passed, 0 failed.
- The account page with three sessions was rendered locally with headless Chrome to check the layout. Not run: a real sign-in, which works only on the server.

## Limits and follow-up

- An app keeps accepting a signed-out session for up to 30 seconds (the `@sirloinbh/auth-client` cache). The cookie cache is off (#39).
