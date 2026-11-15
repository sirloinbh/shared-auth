# shared-auth

One sign-in for every daysofme app ([ADR-0015](https://github.com/sirloinbh/project-standards/blob/main/docs/adr/0015-shared-sign-in.md)). It runs at `https://auth.daysofme.com` on the shared server, next to the apps.

- Sign in with GitHub or Google. Only the emails in `ALLOWED_EMAILS` may sign in, and they form one owner: the first sign-in creates the owner, and the other provider is linked on `/account`.
- The session cookie (`__Secure-sirloinbh.session_token`) is set on `daysofme.com`, so every app subdomain receives it. Apps check it with [`@sirloinbh/auth-client`](https://github.com/sirloinbh/project-standards/tree/main/packages/auth-client) over the private Docker network `shared-auth` (`http://shared-auth-api:3110`).
- Built on [Better Auth](https://better-auth.com) 1.7.15 (pinned), Express 5, and PostgreSQL 17. Better Auth creates its own tables on start (`dist/migrate.js`).

## Pages and endpoints

| Path | What it does |
|---|---|
| `/sign-in?returnTo=<url>` | GitHub and Google buttons. `returnTo` must be HTTPS on `daysofme.com` or a subdomain |
| `/account` | The signed-in owner, the linked providers, buttons to link the other one, and sign-out |
| `/sign-out?returnTo=<url>` | Ends the session for every app |
| `/api/auth/*` | Better Auth (`get-session`, `sign-in/social`, `callback/github`, `callback/google`, `link-social`, `sign-out`, ...) |
| `/api/health` | 200 when the database answers |

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

A full local run needs Docker and a filled `.env`: `docker compose up --build`, then `http://localhost:8110/sign-in`. GitHub and Google send the browser back only to the registered `https://auth.daysofme.com` callbacks, so a real sign-in works only on the server.
