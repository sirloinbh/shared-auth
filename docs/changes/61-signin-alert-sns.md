# #61 Send the new-device sign-in alert through the shared SNS topic instead of SES

Issue: https://github.com/sirloinbh/shared-auth/issues/61

## Purpose

The new-device alert (#36) went out through SES `SendEmail`, which needed a verified SES identity and its own IAM key. project-standards#1091 and shared-aws-infrastructure#105 already set up one SNS topic and one alert IAM user (allowed `sns:Publish` on that topic) for the server signals, so the alert reuses that path.

## Decision

User decision (2026-11-24), option A: the API container publishes to the shared SNS topic itself, with the #36 signer (service `sns`) and the alert IAM user from shared-aws-infrastructure#105. The alert stays off until its SSM keys are set. The SES sender is removed, because nothing else uses it.

## Changes

- `backend/src/ses.ts` → `backend/src/sns.ts`: `signV4` is unchanged; `sesSender`/`sesConfigFrom` are replaced by `snsSender` (SNS query API `Action=Publish`, `Version=2010-03-31`, form body, signed for service `sns`) and `snsConfigFrom` (null unless `AWS_ALERT_REGION`, `AWS_ALERT_ACCESS_KEY_ID`, `AWS_ALERT_SECRET_ACCESS_KEY`, and `AWS_ALERT_TOPIC_ARN` are all set). A refused request throws `SNS Publish answered <status>` only.
- `backend/src/server.ts`: picks the SNS sender; the start log says `new sign-in alert: sns on` or `off (AWS_ALERT_* keys not set)`.
- `.env.example`, `compose.yaml`: the five SES keys are replaced by the four `AWS_ALERT_*` keys, each read from SSM `/sirloinbh/shared-auth/alert-region`, `alert-access-key-id`, `alert-secret-access-key`, `alert-topic-arn` on deploy. The names match the shared server `.env` keys of #1091.
- `README.md`: the "New sign-in alert" section.
- #46: the SES steps are replaced by one step to register the four SSM keys.

## Verification

- `npm run typecheck`: passed.
- `npm test`: see the PR. `test/sns.test.ts`: one signed `Publish` request with the topic, subject, and text; a 403 throws with the status only; off unless all four keys are set; a new device publishes one message and a known one none.
- Not run: a real publish (needs the SSM keys on the server).
