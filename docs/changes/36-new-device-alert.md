# #36 Alert the owner on a sign-in from a new device or IP

Issue: https://github.com/sirloinbh/shared-auth/issues/36

## Purpose

There is one owner, so a sign-in from a new place is worth knowing about at once. Nothing told the owner about a sign-in.

## Changes

- `backend/src/new-device.ts`: `newDeviceWatcher` listens to the sign-in events from #33. For a success it remembers the IP and the device (the user agent without version numbers, so a browser update is not a new device) per user, stored only as SHA-256 hashes, and sends one alert when either is new. Refusals are ignored. A failing channel writes one `"level":"error"` line (`sign_in_alert_failed`, counted by the daily report) and never fails the sign-in.
- `backend/src/new-device.ts`, `backend/src/migrate.ts`: the `sign_in_seen` table (`user_id`, `kind`, `value_hash`, `first_seen`), created after Better Auth's migrations.
- `backend/src/server.ts`: every sign-in event goes to the console log and the watcher. The sender is `null` for now: sign-ins are remembered from the first deploy, so turning the alert on later does not report the devices the owner already uses.

- `backend/src/ses.ts`: `sesSender` emails the alert through the SES v2 `SendEmail` API with `fetch`, signed with AWS Signature Version 4 from `node:crypto` (no AWS SDK package). `sesConfigFrom` returns null, so the alert is off, unless all five keys are set. Errors carry the HTTP status only.
- `backend/src/server.ts`: uses the SES sender when configured and logs `new sign-in alert: email on` or `off`.
- `compose.yaml`, `.env.example`: the five optional keys; four come from SSM under `/sirloinbh/shared-auth/`.
- `README.md`: a "New sign-in alert" section.

## Decisions

- Channel: email through AWS SES (user decision, 2026-11-23, relayed by the coordinator), without a new npm package.
- Chose an IAM user with its own access key (`SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`) over the server's SSM reader key: the containers get no AWS key today, and this key can be limited to `ses:SendEmail`.
- Chose "new IP or new device" exactly as the issue says. A phone that changes IPs often will send more alerts; say so if the IP part should be dropped or widened.

## User steps (added to #46)

- Verify the sender identity in SES (region `ap-northeast-2` unless `SES_REGION` changes), and move SES out of the sandbox or verify the recipient too.
- Create an IAM user (or key) allowed only `ses:SendEmail` on that identity, and register its key pair, the sender, and the recipient in SSM under the four keys in `.env.example`.

## Verification

- `npm run typecheck`: passed.
- `npm test`: 36 passed, 0 failed. `test/ses.test.ts`: the signer reproduces the AWS documentation example signature (IAM ListUsers, 2015-08-30); the sender posts one signed SendEmail request; a refusal throws with the status only; the alert is off unless every key is set. `test/new-device.test.ts` uses a fake sender: a new device sends one alert, a known one none, a browser update is the same device, a new IP alone alerts, refusals and other users are kept apart, no channel sends nothing but remembers, a failing channel is reported and not thrown.
- `node .standards/check.mjs`: passed (existing warnings only). `node .standards/secret-scan.mjs`: no suspicious items.
- Not run: a real email, which needs the SES identity and the SSM keys (#46), and a real sign-in (server only).
