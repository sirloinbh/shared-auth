#!/bin/bash
# Signals for healthchecks.io, like the apps (project-standards #284). The firewall only lets
# allowed IPs in, so the server sends signals out instead, and a missing signal raises the alert.
#   notify.sh ping <check> ok|fail [message]   one signal; the message is the ping body
# Checks and their .env keys (the ping URL holds a secret UUID; it is never printed):
#   deploy  HEALTHCHECK_URL_DEPLOY    every autodeploy run (2 minutes)
#   backup  HEALTHCHECK_URL_BACKUP    the nightly dump
#   restore HEALTHCHECK_URL_RESTORE   the weekly restore check
# A check without a URL in .env is skipped. A failed ping never fails the caller.
set -uo pipefail
cd /opt/shared-auth

env_value() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1 | tr -d "\"'\r"; }

ping_check() {
  local check=$1 status=$2 message=${3:-} key url
  case "$check" in
    deploy | backup | restore) ;;
    *)
      echo "unknown check: $check" >&2
      return 2
      ;;
  esac
  case "$status" in
    ok | fail) ;;
    *)
      echo "status must be ok or fail: $status" >&2
      return 2
      ;;
  esac
  key=HEALTHCHECK_URL_$(printf '%s' "$check" | tr '[:lower:]' '[:upper:]')
  url=$(env_value "$key")
  [ -n "$url" ] || return 0
  if [ "$status" = fail ]; then url=$url/fail; fi
  # The body shows up in the healthchecks.io log (first 10 KB are kept).
  if ! printf '%s' "$message" | head -c 10000 | curl -fsS -m 10 --retry 3 -o /dev/null --data-binary @- "$url"; then
    echo "could not send the $check signal" >&2
  fi
  return 0
}

case "${1:-}" in
  ping) ping_check "${2:-}" "${3:-}" "${4:-}" ;;
  *)
    echo "usage: notify.sh ping <check> ok|fail [message]" >&2
    exit 2
    ;;
esac
