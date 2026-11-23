# #34 Give the sign-in pages the shared app look

Issue: https://github.com/sirloinbh/shared-auth/issues/34

## Purpose

The sign-in, account, and sign-out pages had their own small stylesheet, so moving from an app to sign-in looked like a different site. They now use the shared design token values of the daysofme apps.

## Changes

- `backend/src/styles.ts` (new): the page stylesheet, with a copy of the token values from `@sirloinbh/design-tokens` 1.1.0 (`TOKENS_VERSION`): neutral colors, Pretendard font stack, type sizes, radius, touch target, focus ring, motion. Dark mode follows `prefers-color-scheme`.
- `backend/src/pages.ts`: uses `STYLES` instead of its own colors.
- `backend/test/pages.test.ts` (new): checks that the three pages carry the token values in light and dark mode and no hex color outside the tokens.
- `README.md`: a "Page look" section naming the tokens version and how to keep the copy in step.

## Choices

- Copy the values with a version note instead of reading the published `tokens.css`: the package lives in GitHub Packages, and installing it needs the user's approval and a registry token at build time. A copy keeps the build as it is.
- The Pretendard font files are not served. Serving them means copying 92 woff2 files into this repo; the pages fall back to the system font where Pretendard is not installed.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 18 passed, 0 failed.

## Limits and follow-up

- #41 redoes the page layout (card, provider marks) on top of this stylesheet.
- #38 moves the inline style for the Content-Security-Policy.
