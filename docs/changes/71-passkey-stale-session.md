# #71 Ask to sign in again before adding a passkey with an old session

Issue: https://github.com/sirloinbh/shared-auth/issues/71

## Purpose

Better Auth's `generate-register-options` and `verify-registration` need a session younger than `freshAge` (1 day). With an older session "Add a passkey" failed with the raw "Session is not fresh" (the owner hit it on 2026-11-24). #48 keeps browser sessions alive, so old sessions are normal.

## Changes

- `backend/src/pages.ts`: on `/account`, a session older than `freshAge` shows "Sign in again to add a passkey" with a "Sign in again" button (sign out, then `/sign-in`), as unlinking does (#43), instead of the "Add a passkey" button. `PASSKEY_SCRIPT` maps a `SESSION_NOT_FRESH` error code to the same fixed message, never the raw server text.
- "Remove" on a passkey is unchanged: `delete-passkey` does not use the fresh-session check in `@better-auth/passkey`.
- `backend/test/account.test.ts`: a fresh and a stale session (page and a 403 `SESSION_NOT_FRESH` from the endpoint), and the script mapping.

## Verification

- `npm run typecheck`, `npm test` in `backend/`: see the PR.
- Not run: a real passkey registration (needs the production host).
