# #77 Public about and privacy pages

Issue: https://github.com/sirloinbh/shared-auth/issues/77 (parent #32).

## Purpose

Google needs an application home page and a privacy policy on the authorized domain before the OAuth consent screen of the GCP project `daysofme-auth` can be published. That project serves this sign-in and the study-log calendar sync (scope `calendar.app.created`).

## Changes

- `GET /about` and `GET /privacy` (`backend/src/app.ts`, `aboutPage` and `privacyPage` in `backend/src/pages.ts`): plain HTML with no session check, no scripts and no inline code, under the same security headers and CSP as the other pages. Each links to the other.
- The policy says what Google data is used (sign-in profile name and email; for study-log, only the calendars the app creates and their events, titles and dates only), that the refresh token is stored encrypted and never logged, that nothing is shared, sold or used for ads or AI training, and how to revoke (Disconnect in study-log Settings, Google account permissions, unlink Google on `/account`).
- `backend/src/styles.ts`: a wider `main.wide` and `.doc` text styles (token values only).
- README pages table.

## Notes

- The pages carry no contact address; the owner's email is not written into the repo. Add one if the Google review asks for it.
- Publishing the consent screen is done by the owner in Google Cloud Console.

## Verification

- `backend/`: `npm run typecheck` passes; `npm test` 75 of 75 pass (new test: both pages answer 200 without a session with the CSP, contain no inline code, include the required policy statements and link to each other).
- Both URLs are checked against production after the deploy.
