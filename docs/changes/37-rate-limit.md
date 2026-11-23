# #37 Set the rate limit explicitly and test the client IP behind the proxy

Issue: https://github.com/sirloinbh/shared-auth/issues/37

## Purpose

Better Auth's rate limit was left at its defaults, which read the client IP from `X-Forwarded-For`. Behind the server's nginx that header holds what the client sent plus the real address, so the limit could be dodged or shared by everyone.

## What the proxy sends

project-standards `scripts/lib/proxy.mjs` (the generated `nginx/apps.conf`) sets, for every subdomain including `auth`:

- `X-Real-IP $remote_addr`: the address nginx accepted the connection from. nginx replaces any value the client sent.
- `X-Forwarded-For $proxy_add_x_forwarded_for`: the client's own header with the real address appended. With a forged header it has two entries, and Better Auth (no trusted proxies set) then finds no IP at all.

## Changes

- `backend/src/auth.ts`: `advanced.ipAddress.ipAddressHeaders: ['x-real-ip']`; `rateLimit` enabled in every environment with memory storage, 100 requests per minute per IP and path, and 10 per minute for `/sign-in/*`, `/link-social`, and `/callback/*`. `/get-session` without `X-Real-IP` (app containers calling over the `shared-auth` Docker network) is not limited, because those calls would otherwise share one count and one busy app could lock every app out.
- `backend/test/app.test.ts`: different `X-Real-IP` values are counted apart; the 11th sign-in start in a minute answers 429; a forged `X-Forwarded-For` does not reset the count; internal session checks go past 100 while browser ones get 429.
- `README.md`: a "Request limits" section.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 19 passed, 0 failed.
- Mutation check: with the `ipAddressHeaders` line removed, the per-IP and forged-header tests fail (2 failed), so they test the setting.
- Not run: requests through the real nginx on the server.

## Limits and follow-up

- `app.set('trust proxy', 'loopback')` in `backend/src/app.ts` does not affect Better Auth, which reads the header itself. Nothing in this service uses `req.ip`.
- Rate limit counts live in memory; more than one API container would need database or secondary storage.
