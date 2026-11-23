# #44 Show why a sign-in was refused

Issue: https://github.com/sirloinbh/shared-auth/issues/44

## Purpose

`/sign-in` showed "Sign-in was refused. Use an allowed account." for any `error` query, although `newUserProblem` already knew two different reasons. The page now says which one it was.

## What Better Auth sends

When a database hook throws an `APIError` with a `code`, Better Auth's OAuth callback (`better-auth/dist/api/routes/callback.mjs`) redirects to the `errorCallbackURL` with `?error=<code>&error_description=<message>`. Without a code it answers a bare 403 (#35).

## Changes

- `backend/src/rules.ts`: `REFUSALS` maps each reason (`not_allowed`, `second_user`) to its message; `refusalMessage(code)` returns that message, a fixed default (`SIGN_IN_FAILED`) for any other code, or nothing when there is no code. The query text is never shown.
- `backend/src/auth.ts`: the hooks throw with the reason as the code (was `SIGN_IN_REFUSED` for both).
- `backend/src/app.ts`: `/sign-in` shows `refusalMessage(error)`.
- `backend/src/pages.ts`: the sign-in buttons send `errorCallbackURL: /sign-in?returnTo=<returnTo>`, so a refused sign-in comes back with the same app name and return address.
- Tests: `rules.test.ts` (each code, unknown codes such as `__proto__`), `app.test.ts` (each message on the page, an unknown code with markup, the error callback with `returnTo` accepted by Better Auth), `signin-log.test.ts` (a mocked GitHub callback redirects to `/sign-in?error=not_allowed` and `?error=second_user`).
- `README.md`: the reasons in the pages table.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 34 passed, 0 failed.
- Not run: a real sign-in, which works only on the server.

## Limits and follow-up

- Linking a provider on `/account` that fails comes back to `/account?error=...`, and the account page does not show it yet.
