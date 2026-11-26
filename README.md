# shared-auth

One sign-in for every daysofme app ([ADR-0015](https://github.com/sirloinbh/project-standards/blob/main/docs/adr/0015-shared-sign-in.md)). It runs at `https://auth.daysofme.com` on the shared server, next to the apps.

- Sign in with GitHub or Google. Only the emails in `ALLOWED_EMAILS` may sign in, and they form one owner: the first sign-in creates the owner, and the other provider is linked on `/account`.
- A passkey registered on `/account` is the emergency way in when GitHub and Google are both unavailable (#54). It is tied to `auth.daysofme.com` (the WebAuthn relying party), and a passkey sign-in still has to pass the `ALLOWED_EMAILS` check.
- `ALLOWED_EMAILS` is checked when the owner is created and again whenever a session is created, so a removed email cannot sign in again. Changing `ALLOWED_EMAILS` needs a restart (`bash deploy/deploy.sh`); on start the API deletes the open sessions of every user whose email is no longer listed, and logs how many it signed out.
- The session cookie (`__Secure-sirloinbh.session_token`) is set on `daysofme.com`, so every app subdomain receives it. Apps check it with [`@sirloinbh/auth-client`](https://github.com/sirloinbh/project-standards/tree/main/packages/auth-client) over the private Docker network `shared-auth` (`http://shared-auth-api:3110`).
- Built on [Better Auth](https://better-auth.com) 1.7.15 (pinned), Express 5, and PostgreSQL 17. Better Auth creates its own tables on start (`dist/migrate.js`).

## Pages and endpoints

| Path | What it does |
|---|---|
| `/sign-in?returnTo=<url>` | "Sign in to continue to <app>" with GitHub, Google, and passkey buttons. `returnTo` must be HTTPS on `daysofme.com` or a subdomain; the app name comes from `backend/src/apps.ts` (a copy of the registry display names), and an unknown subdomain shows its host. A refused sign-in comes back here with the same `returnTo` and `error=<reason>`: `not_allowed` (email not in `ALLOWED_EMAILS`) or `second_user` (sign in with the first account, then link this one) show their own message; any other code shows a fixed default, never the query text |
| `/account` | The signed-in owner, the linked providers, buttons to link the other one, the active sessions, and sign-out. With both providers linked, each has an "Unlink" button (Better Auth's `unlink-account`); the last provider can never be unlinked, and Better Auth refuses it too. Unlinking needs a sign-in from the last day (Better Auth's `freshAge`), so an older session sees "sign in again" instead of the buttons. The registered passkeys are listed with "Add a passkey" and "Remove"; adding one also needs a sign-in from the last day, so an older session sees "Sign in again to add a passkey" instead of the button (removing needs no fresh session). A failed link comes back as `/account?error=<code>` and shows a fixed message. Each session shows its device (browser and system from the user agent), IP, sign-in time, and last use (Seoul time); the current one is marked "This device", and every other one has a "Sign out" button. With two or more other sessions, "Sign out other devices" ends them all. A signed-out device stays signed in to an app for up to 30 seconds, the `@sirloinbh/auth-client` cache |
| `POST /account/sessions/revoke` | Used by the session "Sign out" buttons: `{ "id": "<session id>" }`, JSON only, from this service's origin. Ends one other session of the signed-in owner, so session tokens never reach the page |
| `/assets/webauthn.js` | The browser half of the passkey flow (`@simplewebauthn/browser`, served from the installed package) |
| `/sign-out?returnTo=<url>` | Ends the session for every app |
| `/api/auth/*` | Better Auth (`get-session`, `sign-in/social`, `callback/github`, `callback/google`, `link-social`, `sign-out`, ...) |
| `/assets/pages.css`, `/assets/pages.js`, `/assets/passkey.js` | The pages' stylesheet, button script, and passkey button script, served as files so the pages have no inline code (`Cache-Control: no-cache`, as `/assets/webauthn.js`) |
| `/api/health` | 200 when the database answers. The `api` container's Compose healthcheck calls it, so `docker compose ps` shows `healthy` and `docker compose up -d --wait` waits for it |

## Page look

The pages use the shared design tokens of the daysofme apps, `@sirloinbh/design-tokens` **1.1.0** (sirloinbh/project-standards `packages/design-tokens/tokens.css`, ADR-0008): the same neutral colors, type sizes, corner radius, and spacing. This service has no frontend build, so `backend/src/styles.ts` holds a copy of the token values it uses, with `TOKENS_VERSION` naming the version. When the tokens change, copy the new values from `tokens.css` and raise `TOKENS_VERSION`. Every page is one centered card under the service name; the provider buttons carry the unaltered GitHub mark and Google "G" as inline SVG. Dark mode follows the system setting (`prefers-color-scheme`). The font stack starts with Pretendard, but the font files are not served here, so the pages show Pretendard only where it is installed and the system font otherwise.

## Security headers

Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cache-Control: no-store` (the assets: `no-cache`), and this Content-Security-Policy (`CONTENT_SECURITY_POLICY` in `backend/src/app.ts`, #38):

```text
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'
```

Only this service's own files and endpoints load. A page must not add inline `<script>`, `<style>`, `style=` or `on*=` attributes; put styles in `backend/src/styles.ts` and script in `SCRIPT` or `PASSKEY_SCRIPT` in `backend/src/pages.ts`, served under `/assets/`. After a button's request, the browser navigates to GitHub, Google, or an app, which the policy does not limit.

## Sessions

Set in `SESSION` in `backend/src/auth.ts` (#39):

| Setting | Value | What it means |
|---|---|---|
| `expiresIn` | 30 days | The session's lifetime. Apps check the session server-to-server, which moves its database expiry forward but never passes a refreshed cookie back to the browser. So opening `/account`, or `/sign-in` while signed in, sends the browser its cookie again with a lifetime that ends when the database session ends (#48). The owner signs in again only after 30 days without using any app, or after 30 days without opening an auth page |
| `updateAge` | 1 day | A session used after a day gets its database expiry moved forward |
| `cookieCache` | off | The cache cookie would save database reads only for its `maxAge` after sign-in, and a signed-out or removed session would stay usable that long. `@sirloinbh/auth-client` already caches each successful check for 30 seconds, so a sign-out or a removed email reaches every app within 30 seconds |

## Passkeys

Built on `@better-auth/passkey` 1.7.15 (pinned; it brings `@simplewebauthn/server` and `@simplewebauthn/browser`). Better Auth's migration creates the `passkey` table on start.

- Register a passkey while signed in: `/account`, "Add a passkey". Registering needs a session, so a stranger cannot add one. Add at least two (for example a phone and a laptop, or a hardware key), so losing one device is not the end.
- Sign in: `/sign-in`, "Sign in with a passkey". The session is created through the same hooks as GitHub and Google, so an email removed from `ALLOWED_EMAILS` is refused, and the sign-in line is logged with provider `passkey`.
- The relying party ID is the host of `BETTER_AUTH_URL` (`auth.daysofme.com`; `localhost` locally), so passkeys work only on these pages, which is where every sign-in happens.
- A real registration needs a browser and HTTPS (or `localhost`); the tests cover the options, the guards, the account page, and the limits, not a real authenticator.

## Request limits

Better Auth's rate limit, set in `RATE_LIMIT` in `backend/src/auth.ts` (#37). It counts requests to `/api/auth/*` per client IP and path, in memory (one API container; a restart clears the counts). Over the limit, the answer is `429` with `X-Retry-After` in seconds.

| Path under `/api/auth` | Limit |
|---|---|
| `/sign-in/*`, `/link-social`, `/callback/*`, `/passkey/*` | 10 per minute |
| `/get-session` from an app container (no `X-Real-IP`) | Not limited; `@sirloinbh/auth-client` caches each check for 30 seconds |
| Everything else, including `/get-session` from a browser | 100 per minute |

The client IP comes from `X-Real-IP`, which the server's nginx sets to the address it accepted the connection from (project-standards `scripts/lib/proxy.mjs`), replacing any value the client sent. `X-Forwarded-For` is not used, because nginx appends to what the client sent and its first entry can be forged. If the proxy config stops sending `X-Real-IP`, browser requests lose their per-IP count, so keep the two in step.

## Request logs

Every request except `/api/health` writes one JSON line when it ends (#64, `backend/src/request-log.ts`), the same shape as the apps' managed `requestLog` (project-standards `docs/logging.md`):

```json
{"time":"2026-11-23T03:00:00.000Z","level":"info","requestId":"5f0c…","method":"GET","path":"/api/auth/get-session","status":200,"ms":4}
```

| Field | Meaning |
|---|---|
| `level` | `info` below 400, `warn` for 4xx (stdout), `error` for 5xx (stderr), so the daily report's error count lists 5xx lines with their `requestId`, `status`, and `path` |
| `requestId` | An incoming `X-Request-Id` that matches `^[\w.-]{1,128}$` is kept (apps send theirs through `@sirloinbh/auth-client`, project-standards#1082); anything else is replaced with a new UUID. It is sent back in the `X-Request-Id` response header and is also on the `sign_in` line of the same request |
| `path` | Without the query string, so the OAuth `code` and `state` and `returnTo` stay out of the log |
| `status`, `ms` | `499` with `"aborted":true` when the client went away first |

The line holds no body, header, or cookie. `/api/health` is not logged, because the Compose healthcheck calls it every 5 seconds. To follow an app request: `docker logs shared-auth-api-1 2>&1 | grep '"requestId":"5f0c'`. Read the logs with `docker logs`, not `docker compose logs`: Compose needs the SSM secrets in the shell to read `compose.yaml` and stops with "required variable ... is missing a value" (only `deploy/deploy.sh` loads them).

## Sign-in records

Every sign-in outcome writes one JSON line to the `api` logs (#33, `backend/src/signin-log.ts`), in the request log shape of project-standards `docs/logging.md`:

```json
{"time":"2026-11-23T03:00:00.000Z","level":"info","event":"sign_in","outcome":"success","provider":"github","userId":"qBcm…","ip":"203.0.113.7","userAgent":"Mozilla/5.0 …"}
{"time":"2026-11-23T03:01:00.000Z","level":"warn","event":"sign_in","outcome":"refused_not_allowed","provider":"google","email":"s***@example.com","ip":"198.51.100.4","userAgent":"Mozilla/5.0 …"}
```

| Field | Meaning |
|---|---|
| `level` | `info` for a success, `warn` for a refusal (so the daily report's error count ignores refusals) |
| `outcome` | `success`; `refused_not_allowed` (the email is not in `ALLOWED_EMAILS`, at first sign-in or after it was removed); `refused_second_user` (an allowed email that is not the owner; link it on `/account` instead) |
| `provider` | `github` or `google` (`unknown` outside an OAuth callback) |
| `userId` | The owner's user id, when the user exists |
| `email` | Only for an account refused before a user existed, masked to the first letter and the domain (`s***@example.com`) |
| `requestId` | The ID of the request that signed in, the same as on its request line (#64) |
| `ip`, `userAgent` | The client address as Better Auth reads it for the session row, and the user agent (cut to 300 characters) |

No token, cookie, or full email is logged. To list them on the server: `docker logs shared-auth-api-1 2>&1 | grep '"event":"sign_in"'`.

## New sign-in alert

A successful sign-in from an IP or a device the owner has not signed in from before publishes one message to the shared SNS topic of the server signals (#36, #61, `backend/src/new-device.ts`, `backend/src/sns.ts`; topic and IAM user from project-standards#1091 and shared-aws-infrastructure#105), which sends it on to the owner's subscription. The device is the user agent without its version numbers, so a browser update is not a new device. The message names what is new, the provider, the IP, the user agent, and the time; no email address, token, or cookie.

- Every successful sign-in is remembered in the `sign_in_seen` table (user id, `ip` or `device`, a SHA-256 hash of the value, first seen), also while the alert is off. Turning the alert on later therefore reports only places not seen since the first deploy with #36.
- The alert is off unless all four keys are set: `AWS_ALERT_REGION`, `AWS_ALERT_ACCESS_KEY_ID`, `AWS_ALERT_SECRET_ACCESS_KEY`, `AWS_ALERT_TOPIC_ARN` (`.env.example`; all four come from SSM under `/sirloinbh/shared-auth/alert-*`). The IAM user is the alert user of #105, which may only `sns:Publish` on that topic (and send the server metrics). The start log says `new sign-in alert: sns on` or `off` (check with `docker logs shared-auth-api-1 2>&1 | grep "new sign-in alert"`).
- The request is signed with AWS Signature Version 4 from `node:crypto` and sent with `fetch`; there is no AWS SDK package.
- A failed send never blocks the sign-in. It writes one `"level":"error"` line (`"event":"sign_in_alert_failed"`, the HTTP status only), which the daily report counts.

## Registry values

Slot 10 in `sirloinbh/project-standards` `registry/projects.json` (`sharedServices`): web `8110` (published on `127.0.0.1`, forwarded by the server proxy), API `3110` inside the container, DB `15410` (local only).

## Configuration

Every key is in [.env.example](.env.example). On the server the secret values come from AWS SSM under `/sirloinbh/shared-auth/` (ADR-0014); never write them into the repository, logs, or chat.

## Local run and tests

```bash
cd backend
npm ci
npm test            # tsx --test; Better Auth's in-memory adapter, no database needed
npm run typecheck
```

A full local run needs Docker and a filled `.env`: `docker compose up --build`, then `http://localhost:8110/sign-in`. On SIGTERM (`docker compose stop`, or a deploy replacing the container) the API stops taking requests, lets open ones finish for up to 5 seconds, closes the database pool, and exits; `init: true` in `compose.yaml` forwards the signal to node. GitHub and Google send the browser back only to the registered `https://auth.daysofme.com` callbacks, so a real sign-in works only on the server.

## Server deploy [User]

Before the first deploy, the server must be 2 GB (project-standards #550, `docs/costs.md`), the `auth` DNS record and SSM read access must be applied (shared-aws-infrastructure #40), and the proxy must forward `auth.daysofme.com` (project-standards `docs/server-proxy.md`, "Changes later").

First time, in an `ssh` session on the server:

```bash
sudo install -d -o ubuntu -g ubuntu /opt/shared-auth
git clone https://github.com/sirloinbh/shared-auth.git /opt/shared-auth
cd /opt/shared-auth && bash deploy/deploy.sh
```

`deploy/deploy.sh` creates `.env` with a new DB password on the first run, reads the six `@ssm=` keys with the server's reader key, builds and starts the containers under the shared deploy lock, and waits for `/api/health`. Later updates: `cd /opt/shared-auth && bash deploy/deploy.sh`.

Then open `https://auth.daysofme.com/sign-in`, sign in with one provider, and link the other on `/account`.

### Automatic deploys and backups

The same timers as the apps except the 5-minute health check, installed once as root (shared-auth#7). The daily report timer came later (#11, project-standards#967): on a server that already has the other timers, run `install-backup.sh` once more to add it (user step; it reinstalls the backup and restore-check units unchanged):

```bash
sudo bash /opt/shared-auth/deploy/install-autodeploy.sh
sudo bash /opt/shared-auth/deploy/install-backup.sh
```

| Timer | What it does |
|---|---|
| `shared-auth-autodeploy` | Every 2 minutes: when `origin/main` moved and every workflow run for that commit passed, moves the checkout to it and runs `deploy/deploy.sh --no-pull`. A failed commit is skipped until the next one (`.autodeploy-failed`). Until CI arrives with the central sync, no commit has a passing run, so it waits |
| `shared-auth-backup` | 03:30 Seoul: `pg_dump` to `/var/backups/auth` (14 days) with row counts, copied to `s3://<backup bucket>/shared-auth/` when `/opt/project-standards/.env` names the bucket |
| `shared-auth-restore-check` | Sunday 04:30 Seoul: restores the newest dump into a throwaway container and compares the row counts |
| `shared-auth-report` | 04:00 Seoul: `deploy/report.sh` sends one line to the healthchecks.io `report` check: memory, disk, the deployed commit, container memory, and the API error count with up to 5 `<requestId> <status> <path>` entries (lines with `"level":"error"` since the last report, plus the lines `deploy/remote-deploy.sh` saved from a replaced container). The signal fails over `REPORT_MEMORY_PERCENT` (85), `REPORT_DISK_PERCENT` (90), or `REPORT_ERROR_LIMIT` (0) in this repo's `.env`. To see the line only: `bash /opt/shared-auth/deploy/report.sh line` |

`deploy/deploy.sh` also dumps the database before each deploy (label `predeploy`). It takes the server's deploy lock (`/run/lock/apps-deploy.lock`) and the dumps take the backup lock (`/run/lock/apps-backup.lock`), shared with the apps. Optional healthchecks.io signals: `HEALTHCHECK_URL_DEPLOY`, `HEALTHCHECK_URL_BACKUP`, `HEALTHCHECK_URL_RESTORE`, and `HEALTHCHECK_URL_REPORT` in this repo's `.env`. Logs: `journalctl -u shared-auth-autodeploy` (and `-backup`, `-restore-check`, `-report`).

The database holds only the owner, linked accounts, and sessions; if it is lost, signing in again recreates them. To restore a dump: `gunzip -c /var/backups/auth/<dump>.sql.gz | docker exec -i shared-auth-db-1 psql -U auth -d auth` into an empty database.
