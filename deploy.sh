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
  `# User-generated content lives here at runtime — drawings from the paint` \
  `# editor, microphone recordings, uploaded models. It is gitignored, so it` \
  `# does not exist locally, and rsync --delete would erase every user's` \
  `# uploads on each deploy.` \
  --exclude='public/uploads' \
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
  # Apply schema migrations BEFORE building/restarting, so the new code never
  # meets an old schema. There was no migration step here at all, which is why
  # 002/003/004 had never reached production.
  #
  # Applied files are recorded in schema_migrations and skipped thereafter. That
  # matters beyond mere speed: 001 creates a TRIGGER, and re-running it fails
  # with ERROR 1419 on a managed MySQL where the app user lacks SUPER and binary
  # logging is on. Tracking state means already-applied files are never re-run.
  echo '  applying migrations'
  set -a; . $REMOTE/.env; set +a
  DB=\"\${MYSQL_DATABASE:-gameengine}\"
  MYSQL_ARGS=\"-h \${MYSQL_HOST:-localhost} -u \${MYSQL_USER:-root}\"
  if [ -n \"\${MYSQL_PASSWORD:-}\" ]; then MYSQL_ARGS=\"\$MYSQL_ARGS -p\${MYSQL_PASSWORD}\"; fi

  mysql \$MYSQL_ARGS \"\$DB\" -e \"CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );\"

  # A pre-existing database already has 001 applied; record it rather than
  # re-running its trigger.
  if mysql \$MYSQL_ARGS \"\$DB\" -N -B -e \"SHOW TABLES LIKE 'users';\" | grep -q users; then
    mysql \$MYSQL_ARGS \"\$DB\" -e \"INSERT IGNORE INTO schema_migrations (filename) VALUES ('001_initial_schema.sql');\"
  fi

  for m in \$(ls $REMOTE/migrations/*.sql | sort); do
    NAME=\$(basename \"\$m\")
    APPLIED=\$(mysql \$MYSQL_ARGS \"\$DB\" -N -B -e \"SELECT COUNT(*) FROM schema_migrations WHERE filename='\$NAME';\")
    if [ \"\$APPLIED\" != \"0\" ]; then
      echo \"    -- \$NAME (already applied)\"
      continue
    fi
    echo \"    -> \$NAME\"
    mysql \$MYSQL_ARGS \"\$DB\" < \"\$m\"
    mysql \$MYSQL_ARGS \"\$DB\" -e \"INSERT INTO schema_migrations (filename) VALUES ('\$NAME');\"
  done

  # Stop BEFORE wiping .next. The old process used to keep serving during the
  # rebuild, handing browsers HTML that referenced chunk files the build had
  # just deleted — which white-screens the app with
  # \"Application error: a client-side exception has occurred\" for anyone who
  # loads the site mid-deploy. A brief 502 from nginx is far better than a
  # corrupted app: it retries cleanly.
  systemctl stop lingplay
  # Keep the previous build so a failed compile can be rolled back to a
  # working site instead of leaving an empty .next behind.
  rm -rf .next.prev
  [ -d .next ] && mv .next .next.prev
  if ! npm run build; then
    echo 'BUILD FAILED — restoring the previous build'
    rm -rf .next
    [ -d .next.prev ] && mv .next.prev .next
    systemctl start lingplay || true
    exit 1
  fi
  rm -rf .next.prev
  systemctl start lingplay
  sleep 3
  systemctl is-active lingplay
"

echo "==> verifying"
ssh "$USER@$HOST" 'curl -sS -o /dev/null -w "  local :3010 -> HTTP %{http_code}\n" http://127.0.0.1:3010/'
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
