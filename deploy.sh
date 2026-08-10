#!/usr/bin/env bash
# Deploy lingplay to droplet 45.55.39.39 -> play.lingcode.dev
#
# What this does:
#   1. rsync source/ to /opt/lingplay/source/ (preserves node_modules on server)
#   2. npm ci (only if package-lock.json changed) + npm run build
#   3. systemctl restart lingplay
#   4. sanity-curl the app on :3010
#
# Assumes first-time setup was done (MySQL, systemd unit, nginx vhost, TLS).
# See: memory `project-lingplay-deploy` for the from-scratch playbook.

set -euo pipefail

HOST="${LINGPLAY_HOST:-45.55.39.39}"
USER="${LINGPLAY_SSH_USER:-root}"
REMOTE="/opt/lingplay/source"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> rsyncing $LOCAL_DIR -> $USER@$HOST:$REMOTE"
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.worktrees' \
  --exclude='.superpowers' \
  --exclude='.lingcode' \
  --exclude='tsconfig.tsbuildinfo' \
  --exclude='.env.local' \
  --exclude='.env' \
  --exclude='deploy.sh' \
  "$LOCAL_DIR/" "$USER@$HOST:$REMOTE/"

echo "==> installing deps (only if package-lock.json changed) + building on droplet"
ssh "$USER@$HOST" "set -e
  cd $REMOTE
  # Re-link .env from /opt/lingplay/.env (source of truth for secrets)
  cp /opt/lingplay/.env $REMOTE/.env
  # Only re-run npm ci if lockfile hash changed
  LOCK_HASH_FILE=$REMOTE/.npm-lock-hash
  NEW_HASH=\$(sha256sum package-lock.json | cut -d' ' -f1)
  OLD_HASH=\$(cat \$LOCK_HASH_FILE 2>/dev/null || echo none)
  if [ \"\$NEW_HASH\" != \"\$OLD_HASH\" ]; then
    echo '  lockfile changed, running npm ci'
    npm ci --no-audit --no-fund
    echo \$NEW_HASH > \$LOCK_HASH_FILE
  else
    echo '  lockfile unchanged, skipping npm ci'
  fi
  rm -rf .next
  npm run build
  systemctl restart lingplay
  sleep 3
  systemctl is-active lingplay
"

echo "==> verifying"
ssh "$USER@$HOST" 'curl -sS -o /dev/null -w "  local :3010 -> HTTP %{http_code}\n" http://127.0.0.1:3010/'
curl -sS -o /dev/null -w "  https://play.lingcode.dev -> HTTP %{http_code}\n" https://play.lingcode.dev/ 2>/dev/null || echo "  (public URL not reachable yet — check DNS/TLS)"

echo "==> done"
