#!/usr/bin/env bash
# Deploys Eclipseal to the VPS behind nginx:
#   eclipseal.xyz          -> Next.js web on 127.0.0.1:3330
#   eclipseal.xyz/api, /v1 -> API on 127.0.0.1:4330
# The first run creates the service user, the API .env (with a fresh vault secret), the systemd units
# and the nginx site. Later runs sync the code, rebuild and restart. The nginx file is never overwritten
# once it exists, because certbot edits it in place.
#
# Usage: deploy/deploy.sh   (needs DEPLOY_HOST=user@host and DEPLOY_KEY=<path to the SSH key>, from the
# environment or from deploy/target.env, which is gitignored so the server stays out of the repository)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
[ -f "$ROOT/deploy/target.env" ] && . "$ROOT/deploy/target.env"
HOST="${DEPLOY_HOST:?set DEPLOY_HOST=user@host, or put it in deploy/target.env}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/id_ed25519}"
APP_DIR=/var/www/eclipseal
SSH_OPTS=(-i "$KEY" -o IdentitiesOnly=yes)

echo "==> sync to $HOST:$APP_DIR"
ssh "${SSH_OPTS[@]}" "$HOST" "mkdir -p $APP_DIR/apps $APP_DIR/deploy"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude .next --exclude dist --exclude data \
  --exclude '.env*' --exclude '*.tsbuildinfo' --exclude .DS_Store \
  "$ROOT/apps/" "$HOST:$APP_DIR/apps/"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" --exclude target.env "$ROOT/deploy/" "$HOST:$APP_DIR/deploy/"

echo "==> build and restart on the server"
ssh "${SSH_OPTS[@]}" "$HOST" APP_DIR="$APP_DIR" bash -s <<'REMOTE'
set -euo pipefail
cd "$APP_DIR"

id eclipseal >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin eclipseal
mkdir -p data

if [ ! -f apps/api/.env ]; then
  cat > apps/api/.env <<ENV
PORT=4330
HOST=127.0.0.1
CORS_ORIGINS=https://eclipseal.xyz,https://www.eclipseal.xyz
DATA_DIR=$APP_DIR/data
VAULT_MASTER_SECRET=$(openssl rand -hex 32)
CHAIN_RPC_URL=https://rpc.mainnet.chain.robinhood.com
CHAIN_EXPLORER_URL=https://robinhoodchain.blockscout.com
TOKEN_ADDRESS=
PONS_LAUNCHPAD_URL=https://ponsfamily.com/launchpad
DEV_HOLDER_BALANCES=
UPSTREAM_LLM_BASE_URL=
UPSTREAM_LLM_API_KEY=
ENV
  echo "created apps/api/.env"
fi
chown -R eclipseal:eclipseal "$APP_DIR"
chmod 600 apps/api/.env
chmod 700 data

as_app() { sudo -u eclipseal -H bash -c "$1"; }
as_app "cd $APP_DIR/apps/api && npm ci --no-audit --no-fund && npm run build"
as_app "cd $APP_DIR/apps/web && npm ci --no-audit --no-fund && NEXT_PUBLIC_API_URL=https://eclipseal.xyz npm run build"

install -m 644 deploy/systemd/eclipseal-api.service deploy/systemd/eclipseal-web.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --quiet eclipseal-api eclipseal-web
systemctl restart eclipseal-api
systemctl restart eclipseal-web

if [ ! -f /etc/nginx/sites-available/eclipseal.xyz.conf ]; then
  install -m 644 deploy/nginx/eclipseal.xyz.conf /etc/nginx/sites-available/eclipseal.xyz.conf
  ln -sf /etc/nginx/sites-available/eclipseal.xyz.conf /etc/nginx/sites-enabled/eclipseal.xyz.conf
  nginx -t
  systemctl reload nginx
  echo "nginx site added; run certbot once DNS resolves:"
  echo "  certbot --nginx -d eclipseal.xyz -d www.eclipseal.xyz --redirect"
fi

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4330/api/health >/dev/null && curl -fsS -o /dev/null http://127.0.0.1:3330/; then
    echo "healthy: api and web answer on loopback"
    exit 0
  fi
  sleep 1
done
echo "services did not come up; check: journalctl -u eclipseal-api -u eclipseal-web -n 50" >&2
exit 1
REMOTE
