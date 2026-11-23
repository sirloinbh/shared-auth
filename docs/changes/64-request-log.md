# #64 Log each request with a request ID and keep the caller's X-Request-Id

Issue: https://github.com/sirloinbh/shared-auth/issues/64

## Purpose

project-standards#1082 makes `@sirloinbh/auth-client` send the app's request ID as `X-Request-Id`, but shared-auth had no request log, so an app's request could not be followed into the auth service.

## Changes

- `backend/src/request-log.ts`: `requestLog`, the same logic as the apps' managed `requestLog` (project-standards `templates/app/backend/src/standard/http.ts`): keep an incoming `X-Request-Id` matching `^[\w.-]{1,128}$`, else a new UUID; answer it in `X-Request-Id`; one JSON line on `close` with `time`, `level`, `requestId`, `method`, `path` (no query string), `status`, `ms` (`499` and `aborted` when the client left). 5xx lines go to stderr with `"level":"error"`.
- `requestLog` also writes the chosen ID into the request's `x-request-id` header, because Better Auth's database hooks see only the request headers. `backend/src/auth.ts` reads it there and `backend/src/signin-log.ts` adds `requestId` to the `sign_in` line.
- `backend/src/app.ts`: `/api/health` stays first and unlogged (the Compose healthcheck calls it every 5 seconds; `docs/logging.md` allows only the health check before `requestLog`); `requestLog` comes before Better Auth and every page.
- `README.md`: a "Request logs" section and the `requestId` field of the sign-in records.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 69 passed, 0 failed. `test/request-log.test.ts`: a valid ID is kept, answered, logged, and visible to handlers; missing, spaced, 129-character, and JSON-looking IDs are each replaced with a new UUID; the query string (`code`, `state`) is not logged; 4xx is `warn` on stdout and 5xx `error` on stderr. `test/signin-log.test.ts`: an app ID on the OAuth callback reaches the `sign_in` event, and a sign-in without one gets the new UUID.
- Daily report (#11): `deploy/report.sh` counts lines with `"level":"error"` and reads `requestId`, `status`, and `path` from them; a 5xx request line has all three, checked against the test above.
- Not run: a real sign-in (server only).
