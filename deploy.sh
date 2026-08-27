#!/usr/bin/env bash
# Deploy lingplay to droplet 45.55.39.39 -> play.lingcode.dev
#
# What this does:
#   1. rsync source/ to /opt/lingplay/source/ (preserves node_modules on server)
#   2. build a complete release alongside the live site
#   3. briefly restart only to atomically swap the tested build
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
  `# Local agent/tooling state that has no business on the droplet.` \
  `# .opendeploy holds a plaintext MySQL password and JWT_SECRET for the` \
  `# OpenDeploy cluster; it is gitignored, so whether it reaches production` \
  `# depended entirely on which machine ran this script. It is currently` \
  `# absent on the droplet, and this keeps it that way.` \
  --exclude='.opendeploy' \
  --exclude='.codex' \
  --exclude='.mcp.json' \
  --exclude='.DS_Store' \
  `# User-generated content lives here at runtime — drawings from the paint` \
  `# editor, microphone recordings, uploaded models. It is gitignored, so it` \
  `# does not exist locally, and rsync --delete would erase every user's` \
  `# uploads on each deploy.` \
  --exclude='public/uploads' \
  --exclude='deploy.sh' \
  "$LOCAL_DIR/" "$USER@$HOST:$REMOTE/"

echo "==> building a staged release on droplet"
ssh "$USER@$HOST" "REMOTE='$REMOTE' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail

if [ -z "$REMOTE" ]; then
  echo 'remote source directory is required'
  exit 1
fi
BUILD_DIR="$(mktemp -d /opt/lingplay/build.XXXXXX)"
cleanup_stage() {
  rm -rf "$BUILD_DIR"
}
trap cleanup_stage EXIT

# The active directory is fixed by systemd. Build in a sibling so its current
# .next and node_modules remain untouched until a new release is proven good.
cp /opt/lingplay/.env "$REMOTE/.env"
rsync -a \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.worktrees' \
  --exclude='test/.build' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='public/uploads' \
  "$REMOTE/" "$BUILD_DIR/"
cp "$REMOTE/.env" "$BUILD_DIR/.env"

echo '  installing dependencies in the staged release'
(cd "$BUILD_DIR" && npm ci --no-audit --no-fund)

# Apply schema migrations before the swap. Applied files are recorded and
# skipped thereafter, which also prevents re-running migration 001's trigger.
echo '  applying migrations'
set -a; . "$REMOTE/.env"; set +a
DB="${MYSQL_DATABASE:-gameengine}"
MYSQL_ARGS="-h ${MYSQL_HOST:-localhost} -u ${MYSQL_USER:-root}"
if [ -n "${MYSQL_PASSWORD:-}" ]; then MYSQL_ARGS="$MYSQL_ARGS -p${MYSQL_PASSWORD}"; fi

mysql $MYSQL_ARGS "$DB" -e "CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );"

if mysql $MYSQL_ARGS "$DB" -N -B -e "SHOW TABLES LIKE 'users';" | grep -q users; then
  mysql $MYSQL_ARGS "$DB" -e "INSERT IGNORE INTO schema_migrations (filename) VALUES ('001_initial_schema.sql');"
fi

for m in $(ls "$REMOTE"/migrations/*.sql | sort); do
  NAME=$(basename "$m")
  APPLIED=$(mysql $MYSQL_ARGS "$DB" -N -B -e "SELECT COUNT(*) FROM schema_migrations WHERE filename='$NAME';")
  if [ "$APPLIED" != "0" ]; then
    echo "    -- $NAME (already applied)"
    continue
  fi
  echo "    -> $NAME"
  mysql $MYSQL_ARGS "$DB" < "$m"
  mysql $MYSQL_ARGS "$DB" -e "INSERT INTO schema_migrations (filename) VALUES ('$NAME');"
done

echo '  building staged Next.js output'
(cd "$BUILD_DIR" && npm run build)

# Example games are idempotent. Seed using the staged code while the prior
# release still serves, so any seed failure leaves the live app untouched.
echo '  seeding example games'
(cd "$BUILD_DIR" && npm run seed:examples) || echo '  (example seeding failed — gallery keeps the previous copies)'

echo '  swapping staged release'
systemctl stop lingplay
rm -rf "$REMOTE/.next.prev" "$REMOTE/node_modules.prev"
[ -d "$REMOTE/.next" ] && mv "$REMOTE/.next" "$REMOTE/.next.prev"
[ -d "$REMOTE/node_modules" ] && mv "$REMOTE/node_modules" "$REMOTE/node_modules.prev"
mv "$BUILD_DIR/.next" "$REMOTE/.next"
mv "$BUILD_DIR/node_modules" "$REMOTE/node_modules"

if ! systemctl start lingplay; then
  echo 'START FAILED — restoring the previous release'
  systemctl stop lingplay || true
  rm -rf "$REMOTE/.next" "$REMOTE/node_modules"
  [ -d "$REMOTE/.next.prev" ] && mv "$REMOTE/.next.prev" "$REMOTE/.next"
  [ -d "$REMOTE/node_modules.prev" ] && mv "$REMOTE/node_modules.prev" "$REMOTE/node_modules"
  systemctl start lingplay || true
  exit 1
fi
sleep 3
systemctl is-active lingplay
rm -rf "$REMOTE/.next.prev" "$REMOTE/node_modules.prev"
REMOTE_SCRIPT

# Record what shipped. Without this there is no way to answer "what is running
# on the droplet?" short of grepping its source tree — which is how a session
# came to believe production was a week behind when it was current. The tree is
# rsynced, not checked out, so the SHA is only meaningful together with whether
# the working tree was dirty at the time.
RELEASE_SHA="$(git -C "$LOCAL_DIR" rev-parse HEAD 2>/dev/null || echo 'unknown')"
RELEASE_DIRTY="$(git -C "$LOCAL_DIR" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
RELEASE_LINE="$(date -u +%Y-%m-%dT%H:%M:%SZ) $RELEASE_SHA dirty=$RELEASE_DIRTY by=$(whoami)@$(hostname -s)"
ssh "$USER@$HOST" "printf '%s\n' '$RELEASE_LINE' >> /opt/lingplay/RELEASES.log"
echo "==> recorded release: $RELEASE_LINE"

echo "==> verifying"
ssh "$USER@$HOST" 'curl -sS -o /dev/null -w "  local :3010 -> HTTP %{http_code}\n" http://127.0.0.1:3010/'
# `/` renders even when the database is unreachable, so it proves very little.
# /api/health actually touches the DB and 503s when it cannot.
ssh "$USER@$HOST" 'curl -sS -w "  health -> HTTP %{http_code} " http://127.0.0.1:3010/api/health; echo' 
curl -sS -o /dev/null -w "  https://play.lingcode.dev -> HTTP %{http_code}\n" https://play.lingcode.dev/ 2>/dev/null || echo "  (public URL not reachable yet — check DNS/TLS)"

# A 200 is NOT proof the app works: a deploy once white-screened every page with
# a client-side exception while every status code stayed 200. Load the real
# pages in a real browser before calling the deploy good.
if [ -f node_modules/.bin/playwright ] || [ -d node_modules/playwright ]; then
  echo "==> browser smoke test"
  if node scripts/smoke.js "${LINGPLAY_PUBLIC_URL:-https://play.lingcode.dev}"; then
    echo "  smoke passed"
  else
    echo "  SMOKE FAILED — the site is serving broken pages. Investigate or roll back."
    exit 1
  fi
else
  echo "==> skipping browser smoke test (playwright not installed locally)"
fi

echo "==> done"
