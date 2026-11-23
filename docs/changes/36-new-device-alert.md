# #36 Alert the owner on a sign-in from a new device or IP

Issue: https://github.com/sirloinbh/shared-auth/issues/36

## Purpose

There is one owner, so a sign-in from a new place is worth knowing about at once. Nothing told the owner about a sign-in.

## Changes (so far)

- `backend/src/new-device.ts`: `newDeviceWatcher` listens to the sign-in events from #33. For a success it remembers the IP and the device (the user agent without version numbers, so a browser update is not a new device) per user, stored only as SHA-256 hashes, and sends one alert when either is new. Refusals are ignored. A failing channel writes one `"level":"error"` line (`sign_in_alert_failed`, counted by the daily report) and never fails the sign-in.
- `backend/src/new-device.ts`, `backend/src/migrate.ts`: the `sign_in_seen` table (`user_id`, `kind`, `value_hash`, `first_seen`), created after Better Auth's migrations.
- `backend/src/server.ts`: every sign-in event goes to the console log and the watcher. The sender is `null` for now: sign-ins are remembered from the first deploy, so turning the alert on later does not report the devices the owner already uses.

## Open

- The alert channel is not chosen yet (asked the coordinator on 2026-11-23: healthchecks.io `signin` check, Slack webhook, or SES email). The sender, its SSM key in `.env.example`, the README section, and the #46 checkbox follow the answer.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 32 passed, 0 failed. `test/new-device.test.ts` uses a fake sender: a new device sends one alert, a known one none, a browser update is the same device, a new IP alone alerts, refusals and other users are kept apart, no channel sends nothing but remembers, a failing channel is reported and not thrown.
