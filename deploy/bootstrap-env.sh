#!/bin/bash
# Creates .env on the first deploy; deploy/remote-deploy.sh runs it only when .env is missing.
# This file belongs to shared-auth (not a synced file). The DB password is generated once and stays on the server.
set -euo pipefail
cd "$(dirname "$0")/.."
install -m 600 /dev/null .env
printf 'POSTGRES_PASSWORD=%s\nBETTER_AUTH_URL=https://auth.daysofme.com\nROOT_DOMAIN=daysofme.com\n' "$(openssl rand -hex 24)" > .env
echo "deploy: created .env with a new DB password"
