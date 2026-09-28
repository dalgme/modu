import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { countErrorReportsSince } from '@/lib/ops/error-reports';

/**
 * 헬스 체크 (P34-B) — 외부 모니터(UptimeRobot 등)가 `/api/health` 를 찔러 본다.
 * 가벼운 쿼리만 쓴다(`getSystemStatus` 는 호출하지 않음). 비밀값·환경변수 값은 절대 담지 않는다.
 */

export interface HealthReport {
  ok: boolean;
  checks: {
    /** DB 핑 — programs count head 쿼리, 3초 타임아웃 */
    db: { ok: boolean; latencyMs: number | null; error: string | null };
    /** 최근 15분 화면 오류 보고 수 (표가 없거나 조회 실패면 null) */
    errors15m: number | null;
    /** 알림 큐 정체 — 대기 중 알림이 30분 넘게 처리되지 않으면 stale */
    queue: { ok: boolean; pending: number | null; oldestPendingMinutes: number | null };
  };
  version: { commit: string | null; env: string | null };
  time: string;
}

const DB_TIMEOUT_MS = 3_000;
const QUEUE_STALE_MS = 30 * 60_000;

async function pingDb(): Promise<HealthReport['checks']['db']> {
  const started = Date.now();
  try {
    const admin = createAdminClient();
    const query = admin.from('programs').select('id', { count: 'exact', head: true });
    const result = await Promise.race([
      query.then((r) => r),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS)),
    ]);
    if (result.error) return { ok: false, latencyMs: Date.now() - started, error: 'query_failed' };
    return { ok: true, latencyMs: Date.now() - started, error: null };
  } catch (e) {
    const msg = e instanceof Error && e.message === 'timeout' ? 'timeout' : 'unreachable';
    return { ok: false, latencyMs: Date.now() - started, error: msg };
  }
}

async function checkQueue(): Promise<HealthReport['checks']['queue']> {
  try {
    const admin = createAdminClient();
    const [{ count }, { data: oldest }] = await Promise.all([
      admin.from('notifications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('notifications').select('created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ]);
    const pending = count ?? 0;
    const oldestAge = oldest?.created_at ? Date.now() - new Date(oldest.created_at).getTime() : null;
    const stale = pending > 0 && oldestAge !== null && oldestAge > QUEUE_STALE_MS;
    return { ok: !stale, pending, oldestPendingMinutes: oldestAge === null ? null : Math.round(oldestAge / 60_000) };
  } catch {
    return { ok: true, pending: null, oldestPendingMinutes: null };
  }
}

export async function getHealth(): Promise<HealthReport> {
  const db = await pingDb();
  // DB 가 안 되면 나머지도 의미 없다 — 바로 반환 (타임아웃 3초 × 3 을 기다리지 않게)
  const [errors15m, queue] = db.ok
    ? await Promise.all([countErrorReportsSince(15), checkQueue()])
    : [null, { ok: true, pending: null, oldestPendingMinutes: null }];
  return {
    ok: db.ok,
    checks: { db, errors15m, queue },
    version: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      env: process.env.VERCEL_ENV ?? null,
    },
    time: new Date().toISOString(),
  };
}
