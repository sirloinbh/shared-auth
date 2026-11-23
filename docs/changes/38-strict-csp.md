# #38 Tighten the Content-Security-Policy to the service's own resources

Issue: https://github.com/sirloinbh/shared-auth/issues/38

## Purpose

Every response sent only `frame-ancestors 'none'`. The pages are simple, so a strict policy costs little and limits what an injected script could do.

## Changes

- `backend/src/app.ts`: `CONTENT_SECURITY_POLICY` on every response: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`. New routes `/assets/pages.css` (`STYLES`) and `/assets/pages.js` (`SCRIPT`) with `Cache-Control: no-cache`.
- `backend/src/pages.ts`: the pages link the stylesheet and script instead of inlining them; `SCRIPT` is exported as plain JavaScript.
- Tests: `app.test.ts` checks the exact policy on the pages, the assets, and the API, and the asset content types; `pages.test.ts` checks every page links both files and has no inline `<style>`, script body, `style=`, or `on*=` attribute (the token checks moved to the stylesheet itself).
- `README.md`: the asset routes and a "Security headers" section.

## Choices

- Static files over a per-response nonce or hashes: the stylesheet and script are the same on every page, so files need no per-request state and no hash to keep in step when they change. The proxy forwards every path to the API, so no proxy change is needed.
- `no-cache` for the assets (revalidate with the ETag) instead of a long cache, because the file names carry no version.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 54 passed, 0 failed.
- Local browser check: the app with the in-memory adapter on port 3999, `/sign-in` loaded in headless Chrome with the policy header; the stylesheet applied and Chrome logged no Content-Security-Policy violation.
- Not run: clicking the buttons through a real GitHub or Google sign-in, which works only on the server. Added to #46.
