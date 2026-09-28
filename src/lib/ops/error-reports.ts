import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';

/**
 * 화면 오류 보고 저장소 (P34-B, 마이그레이션 0085 `error_reports`).
 * - 브라우저 오류 경계(error.tsx / SafeSlot / global-error)가 `POST /api/client-error` 로 보고 → `recordErrorReport`
 * - Cron `/api/cron/error-alert` 가 `findUnalertedSince` → 문자 통보 → `markAlerted`
 * - 플랫폼 콘솔 시스템 상태 페이지가 `listRecentErrorReports` 로 집계 표시
 * 전부 서비스롤 경로(표는 RLS 활성 + 정책 없음).
 */

export type ErrorReportRow = Tables<'error_reports'>;

export interface ErrorReportInput {
  digest: string | null;
  message: string | null;
  path: string | null;
  scope: string | null;
  userAgent: string | null;
  ipHash: string | null;
  userId?: string | null;
  role?: string | null;
  programId?: string | null;
}

/** 같은 digest+path 가 이 시간 안에 이미 있으면 저장을 생략한다 (새로고침 연타·다중 탭 중복 방지) */
const DEDUPE_WINDOW_MS = 60_000;

/**
 * 보고 1건 저장. 최근 60초 내 같은 digest+path 가 있으면 생략(DB 조회 1회).
 * digest 가 없는 클라이언트 렌더 오류는 path+message 로 중복을 본다.
 * 반환: 'saved' | 'duplicate'. 예외는 던진다(호출측에서 삼킬지 결정).
 */
export async function recordErrorReport(input: ErrorReportInput): Promise<'saved' | 'duplicate'> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  let dupe = admin.from('error_reports').select('id').gte('created_at', since).limit(1);
  dupe = input.path === null ? dupe.is('path', null) : dupe.eq('path', input.path);
  if (input.digest) {
    dupe = dupe.eq('digest', input.digest);
  } else {
    dupe = dupe.is('digest', null);
    dupe = input.message === null ? dupe.is('message', null) : dupe.eq('message', input.message);
  }
  const { data: existing, error: dupeError } = await dupe;
  if (dupeError) throw new Error(dupeError.message);
  if (existing && existing.length > 0) return 'duplicate';

  const { error } = await admin.from('error_reports').insert({
    digest: input.digest,
    message: input.message,
    path: input.path,
    scope: input.scope,
    user_agent: input.userAgent,
    ip_hash: input.ipHash,
    user_id: input.userId ?? null,
    role: input.role ?? null,
    program_id: input.programId ?? null,
  });
  if (error) throw new Error(error.message);
  return 'saved';
}

export interface ErrorReportGroup {
  /** 집계 키 = digest + path (digest 없으면 '-') */
  key: string;
  digest: string | null;
  path: string | null;
  scope: string | null;
  count: number;
  first: string;
  last: string;
  /** 가장 최근 보고의 메시지 (표시용, 100자) */
  sampleMessage: string | null;
}

export interface RecentErrorReports {
  hours: number;
  total: number;
  groups: ErrorReportGroup[];
}

/** 최근 N시간 보고를 digest+path 로 묶어 집계 (최근 순). 표 하나 분량이라 최대 2,000건까지만 읽는다. */
export async function listRecentErrorReports({ hours }: { hours: number }): Promise<RecentErrorReports> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await admin
    .from('error_reports')
    .select('digest, path, scope, message, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const map = new Map<string, ErrorReportGroup>();
  for (const r of rows) {
    const key = `${r.digest ?? '-'}|${r.path ?? '-'}`;
    const g = map.get(key);
    if (g) {
      g.count += 1;
      // 최근 순으로 읽었으므로 first 는 갱신, last 는 첫 행 유지
      if (r.created_at < g.first) g.first = r.created_at;
      if (!g.scope && r.scope) g.scope = r.scope;
    } else {
      map.set(key, {
        key,
        digest: r.digest,
        path: r.path,
        scope: r.scope,
        count: 1,
        first: r.created_at,
        last: r.created_at,
        sampleMessage: r.message ? r.message.slice(0, 100) : null,
      });
    }
  }
  const groups = Array.from(map.values()).sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  return { hours, total: rows.length, groups };
}

/** 최근 N분 내 생성됐고 아직 통보 처리(alerted_at)되지 않은 보고 */
export async function findUnalertedSince(minutes: number): Promise<Pick<ErrorReportRow, 'id' | 'digest' | 'path' | 'scope' | 'created_at'>[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await admin
    .from('error_reports')
    .select('id, digest, path, scope, created_at')
    .is('alerted_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** 마지막 실제 통보 시각 (alerted_at 최대값). 없으면 null. */
export async function lastAlertedAt(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('error_reports')
    .select('alerted_at')
    .not('alerted_at', 'is', null)
    .order('alerted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.alerted_at ?? null;
}

/**
 * 통보 처리 표시. `at` 을 주면 그 시각으로 채운다 — 쿨다운 중 생략한 건은 직전 통보 시각을 넣어
 * `lastAlertedAt()`(최대값)이 실제 마지막 발송 시각을 계속 가리키게 한다(쿨다운이 무한 연장되지 않도록).
 */
export async function markAlerted(ids: string[], at: string = new Date().toISOString()): Promise<void> {
  if (ids.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.from('error_reports').update({ alerted_at: at }).in('id', ids);
  if (error) throw new Error(error.message);
}

/** 최근 N분 보고 건수 (헬스 체크용, 실패 시 null) */
export async function countErrorReportsSince(minutes: number): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const { count, error } = await admin.from('error_reports').select('id', { count: 'exact', head: true }).gte('created_at', since);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}
