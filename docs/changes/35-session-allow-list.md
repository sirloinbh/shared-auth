# #35 Check the allow list each time a session is created

Issue: https://github.com/sirloinbh/shared-auth/issues/35

## Purpose

`ALLOWED_EMAILS` was checked only when the owner user was first created. A user whose email was later removed from the list could still sign in and keep the sessions they had.

## Changes

- `backend/src/auth.ts`: a `databaseHooks.session.create.before` hook looks up the session's user and refuses the session (403, "This account is not allowed to sign in.") when the email is not in `ALLOWED_EMAILS`. `authOptions` takes a `findUserEmail` lookup; `createAuth` wires it to Better Auth's own adapter.
- `backend/src/auth.ts`, `backend/src/server.ts`: `revokeRemovedUsers` runs on start and deletes the sessions of every user whose email is no longer listed. `ALLOWED_EMAILS` comes from the environment, so a change only takes effect with a restart, and the restart is when old sessions are cleared. The log line gives only the count, not the emails.
- `backend/src/rules.ts`: `isAllowedEmail`, shared by the user and session checks.
- `backend/src/migrate.ts`: passes a no-op lookup (migrations never create sessions).
- `README.md`: the allow list rule and the restart step.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 15 passed, 0 failed. New tests: a session is refused for a user whose email was removed; on start, the removed user's sessions are deleted and an allowed user's are kept.
- Not run: a real sign-in, which works only on the server (AGENTS.project.md).

## Limits and follow-up

- Apps that cache the session (the cookie cache, #39) can keep accepting a deleted session until that cache expires.
- The user row and linked accounts of a removed email are kept, so adding the email back restores the same owner.
