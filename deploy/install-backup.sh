#!/bin/bash
# Installs and starts the nightly dump and the weekly restore check. Run once as root on the server;
# adding HEALTHCHECK_URL_* to .env later needs no rerun:
#   sudo bash /opt/shared-auth/deploy/install-backup.sh
set -euo pipefail
dir=$(cd "$(dirname "$0")" && pwd)
install -d -o ubuntu -g ubuntu -m 700 /var/backups/auth
for unit in backup restore-check; do
  install -m 644 "$dir/$unit.service" "/etc/systemd/system/shared-auth-$unit.service"
  install -m 644 "$dir/$unit.timer" "/etc/systemd/system/shared-auth-$unit.timer"
done
systemctl daemon-reload
systemctl enable --now shared-auth-backup.timer shared-auth-restore-check.timer
systemctl list-timers shared-auth-backup.timer shared-auth-restore-check.timer --no-pager
