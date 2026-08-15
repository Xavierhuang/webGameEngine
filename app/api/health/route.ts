import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/mysql/server';

/**
 * Health check for deploys and uptime monitors.
 *
 * deploy.sh used to check `/`, which does a full SSR render of the marketing
 * page — that returns 200 even when the database is unreachable, so it proved
 * very little. This actually touches the database.
 *
 * Deliberately terse and unauthenticated: it exposes liveness, not internals.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  let database = false;

  try {
    const row = await queryOne<{ ok: number }>('SELECT 1 AS ok');
    database = row?.ok === 1;
  } catch (error) {
    console.error('[health] database check failed:', error);
  }

  const body = {
    status: database ? 'ok' : 'degraded',
    database,
    uptimeSeconds: Math.round(process.uptime()),
    responseMs: Date.now() - started,
  };

  // 503 when degraded so an uptime monitor actually alarms rather than seeing
  // a cheerful 200 with a sad payload.
  return NextResponse.json(body, { status: database ? 200 : 503 });
}
