# shared-auth

One sign-in for every daysofme app ([ADR-0015](https://github.com/sirloinbh/project-standards/blob/main/docs/adr/0015-shared-sign-in.md)). It runs at `https://auth.daysofme.com` on the shared server, next to the apps.

- Sign in with GitHub or Google. Only the emails in `ALLOWED_EMAILS` may sign in, and they form one owner: the first sign-in creates the owner, and the other provider is linked on `/account`.
- `ALLOWED_EMAILS` is checked when the owner is created and again whenever a session is created, so a removed email cannot sign in again. Changing `ALLOWED_EMAILS` needs a restart (`bash deploy/deploy.sh`); on start the API deletes the open sessions of every user whose email is no longer listed, and logs how many it signed out.
- The session cookie (`__Secure-sirloinbh.session_token`) is set on `daysofme.com`, so every app subdomain receives it. Apps check it with [`@sirloinbh/auth-client`](https://github.com/sirloinbh/project-standards/tree/main/packages/auth-client) over the private Docker network `shared-auth` (`http://shared-auth-api:3110`).
- Built on [Better Auth](https://better-auth.com) 1.7.15 (pinned), Express 5, and PostgreSQL 17. Better Auth creates its own tables on start (`dist/migrate.js`).

## Pages and endpoints

| Path | What it does |
|---|---|
| `/sign-in?returnTo=<url>` | GitHub and Google buttons. `returnTo` must be HTTPS on `daysofme.com` or a subdomain |
| `/account` | The signed-in owner, the linked providers, buttons to link the other one, and sign-out |
| `/sign-out?returnTo=<url>` | Ends the session for every app |
| `/api/auth/*` | Better Auth (`get-session`, `sign-in/social`, `callback/github`, `callback/google`, `link-social`, `sign-out`, ...) |
| `/api/health` | 200 when the database answers. The `api` container's Compose healthcheck calls it, so `docker compose ps` shows `healthy` and `docker compose up -d --wait` waits for it |

## Page look

The pages use the shared design tokens of the daysofme apps, `@sirloinbh/design-tokens` **1.1.0** (sirloinbh/project-standards `packages/design-tokens/tokens.css`, ADR-0008): the same neutral colors, type sizes, corner radius, and spacing. This service has no frontend build, so `backend/src/styles.ts` holds a copy of the token values it uses, with `TOKENS_VERSION` naming the version. When the tokens change, copy the new values from `tokens.css` and raise `TOKENS_VERSION`. Dark mode follows the system setting (`prefers-color-scheme`). The font stack starts with Pretendard, but the font files are not served here, so the pages show Pretendard only where it is installed and the system font otherwise.

## Sessions

Set in `SESSION` in `backend/src/auth.ts` (#39):

| Setting | Value | What it means |
|---|---|---|
| `expiresIn` | 30 days | The session cookie's lifetime, set once at sign-in. Apps check the session server-to-server and never pass a refreshed cookie back to the browser, so the owner signs in again after 30 days |
| `updateAge` | 1 day | A session used after a day gets its database expiry moved forward |
| `cookieCache` | off | The cache cookie would save database reads only for its `maxAge` after sign-in, and a signed-out or removed session would stay usable that long. `@sirloinbh/auth-client` already caches each successful check for 30 seconds, so a sign-out or a removed email reaches every app within 30 seconds |

## Request limits

Better Auth's rate limit, set in `RATE_LIMIT` in `backend/src/auth.ts` (#37). It counts requests to `/api/auth/*` per client IP and path, in memory (one API container; a restart clears the counts). Over the limit, the answer is `429` with `X-Retry-After` in seconds.

| Path under `/api/auth` | Limit |
|---|---|
| `/sign-in/*`, `/link-social`, `/callback/*` | 10 per minute |
| `/get-session` from an app container (no `X-Real-IP`) | Not limited; `@sirloinbh/auth-client` caches each check for 30 seconds |
| Everything else, including `/get-session` from a browser | 100 per minute |

The client IP comes from `X-Real-IP`, which the server's nginx sets to the address it accepted the connection from (project-standards `scripts/lib/proxy.mjs`), replacing any value the client sent. `X-Forwarded-For` is not used, because nginx appends to what the client sent and its first entry can be forged. If the proxy config stops sending `X-Real-IP`, browser requests lose their per-IP count, so keep the two in step.

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
