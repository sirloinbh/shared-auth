# #43 Unlink a provider on the account page, keeping the last one

Issue: https://github.com/sirloinbh/shared-auth/issues/43

## Purpose

`/account` could only link a provider. A provider linked by mistake, or one the owner stops using, could not be removed.

## Changes

- `backend/src/pages.ts`: with both providers linked, each row has "Unlink <provider>", which posts the account row id to Better Auth's `unlink-account`. With one provider linked there is no button. When the session is older than Better Auth's `freshAge` (1 day), the page shows "To unlink a provider, sign in again first" with a "Sign in again" link instead of buttons that would fail. `accountPage` takes an options object (`linked`, `sessions`, `canUnlink`, `error`).
- `backend/src/app.ts`: passes the linked account ids, `canUnlink` from the session's age and `freshAge`, and the link error message.
- `backend/src/rules.ts`: `linkErrorMessage()` maps Better Auth's `account_already_linked_to_different_user` to its own message and any other code to a fixed default (#44 follow-up: a failed link came back to `/account?error=...` without a message).
- `backend/src/styles.ts`: an inline link-style button and a hint line.
- `backend/test/account.test.ts`: unlinking one of two providers works; the last one has no button and Better Auth refuses it (`FAILED_TO_UNLINK_LAST_ACCOUNT`); a session older than a day sees "sign in again" and is refused (403); link errors show fixed messages.
- `backend/test/github.ts`: the mocked sign-in start now carries the client IP like the callback. Without it every start in a test file shared one rate-limit bucket (Better Auth's in-memory limiter is module-wide) and the 11th start failed.
- `README.md`: unlinking on `/account`.

## Choices

- The server-side refusal of the last provider is Better Auth's own check (`allowUnlinkingAll` stays off), so no extra route is needed. The account row id in the page is not a secret.
- Unlinking keeps Better Auth's fresh-session rule instead of bypassing it with an own route: a stolen older session cannot remove a provider.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 43 passed, 0 failed.
- The account page with two providers (fresh and older session) was rendered locally with headless Chrome. Not run: a real link or unlink with GitHub and Google, which works only on the server.
