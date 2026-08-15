#!/usr/bin/env bash
# Nightly database backup with rotation.
#
# The original audit flagged "no backups, no dump script" and it stayed true
# through everything else: two manual dumps taken by hand, no schedule. Every
# other failure this project hit was recoverable — a bad deploy rolls back, a
# broken build restores. Losing the database is not.
#
# Runs on the droplet from cron. Keeps 14 daily copies.

set -euo pipefail

ENV_FILE="${LINGPLAY_ENV:-/opt/lingplay/.env}"
BACKUP_DIR="${LINGPLAY_BACKUP_DIR:-/opt/lingplay/backups}"
KEEP_DAYS=14

[ -f "$ENV_FILE" ] || { echo "No env file at $ENV_FILE" >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a

DB="${MYSQL_DATABASE:-gameengine}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/${DB}-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

MYSQL_ARGS=(-h "${MYSQL_HOST:-localhost}" -u "${MYSQL_USER:-root}")
[ -n "${MYSQL_PASSWORD:-}" ] && MYSQL_ARGS+=("-p${MYSQL_PASSWORD}")

# --no-tablespaces because the app user lacks the PROCESS privilege; without it
# mysqldump errors out and leaves a truncated file that looks like a backup.
if ! mysqldump --no-tablespaces --routines --triggers --single-transaction \
     "${MYSQL_ARGS[@]}" "$DB" 2>/tmp/backup-err | gzip > "$OUT"; then
  echo "Backup FAILED for $DB" >&2
  sed 's/^/  /' /tmp/backup-err >&2
  rm -f "$OUT"
  exit 1
fi

# A dump that ran but produced nothing is worse than a loud failure: it looks
# like a backup exists. Verify the archive is intact and contains real tables.
if ! gzip -t "$OUT" 2>/dev/null; then
  echo "Backup archive is corrupt: $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

TABLES="$(gzip -dc "$OUT" | grep -c '^CREATE TABLE' || true)"
if [ "$TABLES" -lt 1 ]; then
  echo "Backup contains no tables — refusing to keep it: $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "Backup OK: $OUT ($SIZE, $TABLES tables)"

# Rotate. -mtime +N deletes strictly older than N days.
find "$BACKUP_DIR" -name "${DB}-*.sql.gz" -type f -mtime "+${KEEP_DAYS}" -delete
echo "Retained: $(find "$BACKUP_DIR" -name "${DB}-*.sql.gz" -type f | wc -l | tr -d ' ') backup(s)"
