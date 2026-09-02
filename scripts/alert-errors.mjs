#!/usr/bin/env node
/**
 * Outage and error-spike alerting, from cron on the droplet.
 *
 * Monitoring was a single `error_events` table that a maintainer had to
 * remember to open: you learned about an outage from a user. This checks two
 * things and emails when either is wrong:
 *
 *   1. `/api/health` must answer 200 (it does a real `SELECT 1`).
 *   2. New rows in `error_events` over the last window must stay under a
 *      threshold.
 *
 * Sends through the same Resend integration as parental-consent email, so no
 * new provider. A cooldown file stops a persistent outage from mailing every
 * five minutes. Nothing here can break the app: it runs out of process.
 *
 *   ALERT_EMAIL=you@example.com node scripts/alert-errors.mjs
 *
 * Cron, with the schedule field `star/5 * * * *` (spelled out because the
 * literal would end this comment):
 *   (every five minutes) cd /opt/lingplay/source && set -a && . /opt/lingplay/.env && set +a && node scripts/alert-errors.mjs >> /var/log/lingplay-alerts.log 2>&1
 */

import fs from 'node:fs';
import mysql from 'mysql2/promise';

const HEALTH_URL = process.env.ALERT_HEALTH_URL || 'http://127.0.0.1:3010/api/health';
const ALERT_EMAIL = process.env.ALERT_EMAIL;
const WINDOW_MINUTES = Number(process.env.ALERT_WINDOW_MINUTES || 15);
const ERROR_THRESHOLD = Number(process.env.ALERT_ERROR_THRESHOLD || 20);
const COOLDOWN_MINUTES = Number(process.env.ALERT_COOLDOWN_MINUTES || 60);
const COOLDOWN_FILE = process.env.ALERT_COOLDOWN_FILE || '/tmp/lingplay-alert-last-sent';

async function checkHealth() {
  try {
    const response = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(10_000) });
    const body = await response.text().catch(() => '');
    return { ok: response.status === 200, detail: `HTTP ${response.status} ${body.slice(0, 200)}` };
  } catch (error) {
    return { ok: false, detail: `unreachable: ${error?.message ?? error}` };
  }
}

async function countRecentErrors() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'gameengine',
  });
  try {
    const [rows] = await connection.execute(
      `SELECT COUNT(*) AS events, COALESCE(SUM(occurrences), 0) AS occurrences
         FROM error_events
        WHERE last_seen >= NOW() - INTERVAL ? MINUTE AND resolved = FALSE`,
      [WINDOW_MINUTES],
    );
    const [top] = await connection.execute(
      `SELECT source, message, occurrences, url
         FROM error_events
        WHERE last_seen >= NOW() - INTERVAL ? MINUTE AND resolved = FALSE
        ORDER BY occurrences DESC LIMIT 5`,
      [WINDOW_MINUTES],
    );
    return { count: Number(rows[0]?.occurrences ?? 0), top };
  } finally {
    await connection.end();
  }
}

function inCooldown() {
  try {
    const last = Number(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
    return Date.now() - last < COOLDOWN_MINUTES * 60_000;
  } catch {
    return false;
  }
}

async function sendAlert(subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!ALERT_EMAIL || !apiKey) {
    console.error(`[alert] ${subject}\n${text}\n(ALERT_EMAIL or RESEND_API_KEY unset — not emailed)`);
    return;
  }
  if (inCooldown()) {
    console.log(`[alert] still in cooldown; not re-sending: ${subject}`);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'lingplay <noreply@lingcode.dev>',
      to: [ALERT_EMAIL],
      subject,
      text,
    }),
  });
  if (response.ok) {
    fs.writeFileSync(COOLDOWN_FILE, String(Date.now()));
    console.log(`[alert] sent: ${subject}`);
  } else {
    console.error(`[alert] send failed: HTTP ${response.status}`);
  }
}

const health = await checkHealth();
let errors = { count: 0, top: [] };
let dbDetail = '';
try {
  errors = await countRecentErrors();
} catch (error) {
  dbDetail = `error_events query failed: ${error?.message ?? error}`;
}

const problems = [];
if (!health.ok) problems.push(`Health check failed: ${health.detail}`);
if (dbDetail) problems.push(dbDetail);
if (errors.count >= ERROR_THRESHOLD) {
  const lines = errors.top.map((e) => `  - [${e.source}] ×${e.occurrences} ${e.message?.slice(0, 120)} (${e.url ?? '-'})`);
  problems.push(`${errors.count} error occurrences in the last ${WINDOW_MINUTES} minutes:\n${lines.join('\n')}`);
}

const stamp = new Date().toISOString();
if (problems.length === 0) {
  console.log(`${stamp} ok — health ${health.detail.split(' ')[1] ?? ''}, ${errors.count} error(s) in ${WINDOW_MINUTES}m`);
} else {
  await sendAlert(`[lingplay] ${problems.length === 1 ? 'alert' : `${problems.length} alerts`}: ${problems[0].split('\n')[0].slice(0, 80)}`, `${stamp}\n\n${problems.join('\n\n')}`);
  process.exitCode = 2;
}
