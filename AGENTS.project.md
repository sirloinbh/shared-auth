# shared-auth Project Instructions

These rules apply to this repo only. The common procedure is in [AGENTS.md](AGENTS.md); if the two files differ, this file wins.

## What this repo is

- The shared sign-in service for the apps ([ADR-0015](https://github.com/sirloinbh/project-standards/blob/main/docs/adr/0015-shared-sign-in.md)): Better Auth (pinned to an exact version), Express 5, `pg`, and PostgreSQL 17. It is not an app: there is no frontend and no domain data.
- The Node project is in `backend/` (there is no root `package.json`). `compose.yaml`, `deploy/deploy.sh`, and `.env.example` are at the repo root. [README.md](README.md) lists the pages, endpoints, ports, and configuration; keep it in step with behavior changes.

## Verification commands

Run them in `backend/` before committing and before creating or updating a PR, and record the results in the PR.

| Command | When |
|---|---|
| `npm ci` | First, when `node_modules` is missing (installs exactly what the lockfile says) |
| `npm run typecheck` | Always |
| `npm test` | Always (Better Auth's in-memory adapter; no database needed) |
| `npm run build` | When you change the build, `tsconfig.json`, or the `Dockerfile` |
| `bash -n deploy/*.sh` | When you change a deploy script |

- CI (`.github/workflows/ci.yml`, added by the central sync) runs the same checks plus the standards, supply-chain, and secret checks and a Docker build.
- A real sign-in works only on the server (GitHub and Google call back only to the registered production URLs), so do not mark a sign-in flow as tested locally.

## Rules for this repo

- Keep the allow list: only the emails in `ALLOWED_EMAILS` may sign in, and `returnTo` must be HTTPS on `daysofme.com` or a subdomain. Do not loosen either without the user's decision.
- Never write secret values (OAuth client secrets, the auth secret, the DB password, SSM keys) into the repo, logs, PRs, or chat. The secrets live in AWS SSM under `/sirloinbh/shared-auth/`; `.env.example` lists only the keys.
- Pin dependencies to exact versions (`backend/.npmrc` has `save-exact` and `ignore-scripts`). Raising Better Auth or another dependency needs the lockfile updated and the user's reconfirmation for the package install.
- The port slot (web `8110`, API `3110`, DB `15410`) comes from `registry/projects.json` in `sirloinbh/project-standards`. To change it, open an issue there.

## Merging and deploying

- Merging to `main` deploys once the user has installed `deploy/install-autodeploy.sh` on the server: the timer deploys a commit after its CI passed. Before that, the user deploys by hand (`bash deploy/deploy.sh`, see the README). The agent does not run the deploy, does not touch the server, and does not change the production database. If a change needs a deploy, say so in "Check before merging".