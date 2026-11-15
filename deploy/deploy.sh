#!/bin/bash
# Deploys the shared sign-in on the server: run as ubuntu in /opt/shared-auth.
#   bash deploy/deploy.sh            update to origin/main and restart
#   bash deploy/deploy.sh --no-pull  restart the current checkout
# Keys tagged @ssm= in .env.example are read from AWS SSM with the server's reader key
# (SECRETS_AWS_* in /opt/project-standards/.env, project-standards ADR-0014) and exported for
# compose only; they are never written to disk. The DB password is generated once into .env.
set -euo pipefail
cd "$(dirname "$0")/.."

shared_env=${STANDARDS_ENV_FILE:-/opt/project-standards/.env}
env_value() { [ -r "$shared_env" ] && sed -n "s/^$1=//p" "$shared_env" | tail -n 1 | tr -d "\"'\r" || true; }

# Prints one SecureString value; the key pair goes to curl on standard input, never as an argument.
ssm_get() {
  local region id secret
  region=$(env_value SECRETS_AWS_REGION)
  region=${region:-ap-northeast-2}
  id=$(env_value SECRETS_AWS_ACCESS_KEY_ID)
  secret=$(env_value SECRETS_AWS_SECRET_ACCESS_KEY)
  [ -n "$id" ] && [ -n "$secret" ] || { echo "deploy: SECRETS_AWS_* missing in $shared_env" >&2; return 3; }
  printf 'user = "%s:%s"\n' "$id" "$secret" |
    curl -fsS -K - --aws-sigv4 "aws:amz:$region:ssm" \
      -H 'Content-Type: application/x-amz-json-1.1' -H 'X-Amz-Target: AmazonSSM.GetParameter' \
      --data "{\"Name\":\"$1\",\"WithDecryption\":true}" "https://ssm.$region.amazonaws.com/" |
    python3 -c 'import json, sys; sys.stdout.write(json.load(sys.stdin)["Parameter"]["Value"])'
}

exec 9>/run/lock/apps-deploy.lock
flock 9   # one build at a time on the shared server, like the apps

if [ "${1:-}" != "--no-pull" ]; then
  git fetch -q origin
  git merge -q --ff-only origin/main
fi

if [ ! -f .env ]; then
  install -m 600 /dev/null .env
  printf 'POSTGRES_PASSWORD=%s\nBETTER_AUTH_URL=https://auth.daysofme.com\nROOT_DOMAIN=daysofme.com\n' "$(openssl rand -hex 24)" > .env
  echo "deploy: created .env with a new DB password"
fi

# KEY and parameter pairs from the @ssm= tags in .env.example.
while read -r key name; do
  value=$(ssm_get "$name") || { echo "deploy: could not read $name" >&2; exit 1; }
  export "$key=$value"
done < <(awk '/^[[:space:]]*#/ { tag = ""; if (match($0, /@ssm=[^[:space:]@]+/)) tag = substr($0, RSTART + 5, RLENGTH - 5); next }
  /^[A-Z0-9_]+=/ { if (tag != "") { split($0, kv, "="); print kv[1], tag }; tag = "" }' .env.example)

export IMAGE_TAG
IMAGE_TAG=$(git rev-parse --short=12 HEAD)
docker compose build api
docker compose up -d

web_port=$(sed -n 's/^WEB_PORT=//p' .env | tail -n 1)
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${web_port:-8110}/api/health" > /dev/null 2>&1; then
    echo "deploy: shared-auth $IMAGE_TAG is healthy"
    exit 0
  fi
  sleep 2
done
echo "deploy: health check failed; see: docker compose logs --tail 50 api" >&2
exit 1
