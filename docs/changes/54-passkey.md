# #54 Add passkey sign-in as the emergency way in

Issue: https://github.com/sirloinbh/shared-auth/issues/54

## Purpose

Sign-in was only through GitHub or Google, so losing both meant no way into any app. #40 compared a passkey, recovery codes, and a server-side runbook; the user chose the passkey only (2026-11-23) and approved the package install.

## Changes

- `backend/package.json`, `backend/package-lock.json`: `@better-auth/passkey` 1.7.15, pinned. It brings `@simplewebauthn/server` 13.3.3 (with its `@peculiar/*`, `asn1js`, `tsyringe` dependencies) and `@simplewebauthn/browser` 13.3.0. Installed with `--legacy-peer-deps`: plain `npm install` tried to fetch `@better-auth/core` 1.7.27 for the plugin's peer range `^1.7.15`, which conflicts with the `better-call` 1.4.4 that `better-auth` 1.7.15 pins. Every peer the plugin needs (`@better-auth/core` 1.7.15, `better-call` 1.4.4, `nanostores`, `@better-auth/utils`, `@better-fetch/fetch`) is already installed at a version it accepts, so nothing else was added. A clean `npm ci` (without the flag) installs the lockfile, and `npm ls` shows no invalid peers.
- `backend/src/auth.ts`: the passkey plugin with the relying party ID and origin from `BETTER_AUTH_URL`; `/passkey/*` limited to 10 a minute per IP; sign-in log lines from a passkey sign-in name the provider `passkey`.
- `backend/src/app.ts`: `/assets/webauthn.js` serves `@simplewebauthn/browser`'s bundle from the installed package; `/account` reads the owner's passkeys.
- `backend/src/pages.ts`, `backend/src/styles.ts`: "Sign in with a passkey" on `/sign-in`; a Passkeys list with "Add a passkey" and "Remove" on `/account`.
- `backend/test/passkey.test.ts`: the plugin and its table; the sign-in button and the served script; authentication options name this host; registration needs a session; the account page lists and removes a passkey; the 429 after 10 requests.
- `README.md`: a "Passkeys" section, the new path, and the limit.

## Verification

- `npm ci` (clean `node_modules`, no flags): passed.
- `npm run typecheck`: passed.
- `npm test`: 36 passed, 0 failed.
- `npm run build`: passed, and the built `dist/app.js` loads and finds the WebAuthn bundle.
- Not run: a real passkey registration and sign-in, which needs a browser authenticator on the server's HTTPS address.

## Limits and follow-up

- User step after deploy (in #46): register at least two passkeys on `/account`.
- A passkey works only on `auth.daysofme.com`; that is where every sign-in happens.
