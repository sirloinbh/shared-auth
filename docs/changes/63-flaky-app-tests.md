# #63 Find why two app tests failed once and make them stable

Issue: https://github.com/sirloinbh/shared-auth/issues/63

## Cause

Not the tests' logic and not shared rate-limit state. Every test server listened on port 0, so the OS picked a random port. On this Windows machine the dynamic port range is 1024–14999 (`netsh int ipv4 show dynamicport tcp`), not Windows' default 49152+. That range contains ports that fetch refuses ("bad port", https://fetch.spec.whatwg.org/#port-blocking), such as 5060, 6000, 6665–6669, and 10080. When a server landed on one, every request in that test failed with `TypeError: fetch failed` (cause `bad port`). CI's Linux range (32768–60999) has no blocked port, so CI never failed.

Reproduced: 1 of 20 local `npm test` runs failed, with `fetch failed`, cause `Error: bad port`, in `session checks from app containers ...`.

## Changes

- `backend/test/listen.ts` (new): `listen(handler)` starts a server on 127.0.0.1 with a random port and tries again while the port is in `FETCH_BLOCKED_PORTS`. The list was checked against Node's own fetch: probing ports 1–11000 gave the same 82 ports.
- `backend/test/app.test.ts`, `account.test.ts`, `passkey.test.ts`, `signin-log.test.ts`, `shutdown.test.ts`, `session-cookie.test.ts` (from #48, arrived with the rebase): use `listen()` instead of `listen(0)`.
- `backend/test/listen.test.ts` (new): a sample of listed ports is refused by fetch, neighbors are not, and `listen()` returns a reachable port.

## Verification

- `npm run typecheck`: passed.
- Before: 1 of 20 `npm test` runs failed (`bad port`).
- After: 30 of 30 `npm test` runs passed (59 tests each), then 61 passed with the new helper tests. After rebasing onto `origin/main` (66 tests): 20 of 20 runs passed.
