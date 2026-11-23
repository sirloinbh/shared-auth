# #41 Make the sign-in page look like a familiar OAuth sign-in screen

Issue: https://github.com/sirloinbh/shared-auth/issues/41

## Purpose

The sign-in page showed a title, one line, and two plain buttons. It did not say which app the person came from, and the buttons had no provider marks. It now reads like the sign-in screens of well-known services.

## Changes

- `backend/src/apps.ts` (new): the app display names by subdomain, copied from `registry/projects.json` in sirloinbh/project-standards, and `returnName()`, which names where a sign-in returns (the app, the host of an unknown app, or "your account" for this service).
- `backend/src/pages.ts`: one centered card layout for all three pages (service name, card, error line, note). Sign-in says "to continue to <app>" and has GitHub and Google buttons with the providers' marks as inline SVG. The account page lists the sign-in methods with a "Linked" badge or a "Link" button. The sign-out page has a primary "Sign out" button and says where the person can return.
- `backend/src/styles.ts`: card, list, badge, and button styles from the design tokens.
- `backend/src/app.ts`: passes the app name to the sign-in and sign-out pages.
- Tests: `backend/test/pages.test.ts` checks the app name, both provider buttons with marks, escaping, the error line, the account list, and `returnName()`; `backend/test/app.test.ts` checks the app name on `/sign-in`.
- `docs/changes/41-screenshots/`: the three pages in light and dark mode, rendered with headless Chrome from the page functions (not from a running server).

## Choices

- The display names are copied into `apps.ts` instead of read from the registry at run time: the service has no access to project-standards on the server.
- The provider buttons use the shared neutral outline style with the unaltered marks, instead of each provider's own button colors, so the two buttons look alike and follow the app look of #34.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 25 passed, 0 failed.
- Screenshots: rendered locally with headless Chrome, light and dark (`--force-dark-mode`).

## Limits and follow-up

- A real sign-in is checked only on the server.
