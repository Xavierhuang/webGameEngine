#!/usr/bin/env bash
# Warn via syslog (and self-heal) when the LingPlay origin stops answering.
# No MTA on host, so this lands in journald: `journalctl -t lingplay-uptime`.
#
# Why this exists: on 2026-09-02 an unattended mysql-server upgrade made systemd
# stop lingplay as a Requires= dependent and never start it back. nginx served
# 502 for 24h and nothing noticed. The unit now uses Wants= + Restart=always,
# but Restart= is never consulted for job-driven stops, so a systemd job can
# still leave the unit cleanly inactive. This is the net under that case.
set -euo pipefail
URL=${1:-http://127.0.0.1:3010/}

# curl already prints 000 on a connection failure, so assign on failure rather
# than `|| echo 000`, which would concatenate and log "HTTP 000000".
probe() { curl -sS -m 20 -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null; }

code=$(probe) || code=000
[ "$code" = "200" ] && exit 0

active=$(systemctl is-active lingplay 2>&1 || true)
logger -t lingplay-uptime -p user.warning "origin HTTP ${code} (unit=${active}) -- starting lingplay"

systemctl start lingplay || {
  logger -t lingplay-uptime -p user.err "systemctl start lingplay FAILED -- needs a human"
  exit 1
}

sleep 10
code=$(probe) || code=000
if [ "$code" = "200" ]; then
  logger -t lingplay-uptime -p user.warning "recovered -- origin HTTP 200 after restart"
else
  logger -t lingplay-uptime -p user.err "still HTTP ${code} after restart -- needs a human"
  exit 1
fi
