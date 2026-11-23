# #33 Record sign-in successes and refusals

Issue: https://github.com/sirloinbh/shared-auth/issues/33

## Purpose

Nothing recorded who signed in, from where, or which sign-ins were refused. With one owner, the sign-in record is the main way to notice a stolen account, and the daily report (#45) and the new-device alert (#36) need it.

## Changes

- `backend/src/signin-log.ts`: `signInLine` writes one JSON line per sign-in outcome (`time`, `level`, `event: "sign_in"`, `outcome`, `provider`, `userId` or masked `email`, `ip`, `userAgent`). A success is `info` and a refusal `warn`, so the daily error count (ADR-0021) does not fail on refusals. `maskEmail` keeps the first letter and the domain.
- `backend/src/auth.ts`: the `user.create.before` hook logs `refused_not_allowed` or `refused_second_user` before it throws; the `session.create.before` hook logs `refused_not_allowed` for a removed email; a new `session.create.after` hook logs `success`. The provider comes from the callback's `:id` parameter, the IP from Better Auth's own `getIP` (the same value the session row stores). `createAuth` and `authOptions` take an optional `SignInLog`, defaulting to stdout.
- `backend/src/rules.ts`: `newUserProblem` returns the refusal `reason` with the message, so the log can tell the two kinds apart.
- `README.md`: a "Sign-in records" section with the fields.

The issue mentions "the existing `requestLog` format"; shared-auth has no request log middleware yet, so the line follows the shape in project-standards `docs/logging.md` (`time`, `level`, `event`).

## Verification

- `npm run typecheck`: passed.
- `npm test`: 25 passed (after rebasing onto #37), 0 failed. New tests in `test/signin-log.test.ts` drive the real `/api/auth/callback/github` route with GitHub's token and user endpoints stubbed in `fetch`, and check the logged event for a success, an email outside the allow list, a second allowed account, and a removed email signing in again; plus the line format and the masking.
- Not run: a real sign-in, which works only on the server (AGENTS.project.md).

## Limits and follow-up

- The lines live in the Docker logs only (10 MB x 3 per container), like the other API lines.
- An OAuth failure before the hooks run (a denied consent screen, a bad state) is not logged as a sign-in outcome.
