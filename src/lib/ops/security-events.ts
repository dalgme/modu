import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Json, Tables } from '@/types/database';
import { ESCALATION, detectBruteforce, type LoginAttemptLike, type SecurityKind, type SecuritySeverity } from '@/lib/ops/security-rules';

export { ESCALATION, detectBruteforce, escalate, SECURITY_KIND_LABELS, SECURITY_SEVERITY_LABELS, securityKindLabel } from '@/lib/ops/security-rules';
export type { SecurityKind, SecuritySeverity } from '@/lib/ops/security-rules';

/**
 * 보안 이벤트 저장소 (P35-B, 마이그레이션 0087 `security_events`). 서비스롤 전용(표는 RLS 활성 + 정책 없음).
 *
 * 감지 소스
 *  ① 미들웨어(Edge) — 스캐너 패턴·요청 폭주 → POST /api/ops/security-event (CRON_SECRET) → recordSecurityEvent(kind='scan', warn)
 *  ② 대행 시작 — impersonation-actions → kind='impersonation' (info)
 *  ③ 대량 반출 — 명단/리포트 엑셀·서류 ZIP 라우트 → kind='export' (info). 같은 사용자 10분 내 5회 이상이면 Cron 집계 시 warn 승격
 *  ④ 권한 거부 — capabilities.denyUnless 리스너(src/instrumentation.ts 등록) → kind='denied' (info). 같은 사용자 10분 내 10회면 warn 승격
 *  ⑤ 로그인 실패 폭주 — Cron 이 login_attempts(P35-A) 를 읽어 kind='bruteforce' (critical) 파생
 * 통보: Cron /api/cron/security-alert(5분) 가 findUnalerted → warn 이상이면 문자 → markAlerted (error-reports 와 같은 구조).
 */

export type SecurityEventRow = Tables<'security_events'>;
export interface SecurityEventInput {
  kind: SecurityKind | string;
  severity: SecuritySeverity;
  userId?: string | null;
  ipHash?: string | null;
  path?: string | null;
  detail?: Record<string, Json | undefined> | null;
}

function clip(v: string | null | undefined, max: number): string | null {
  if (!v) return null;
  return v.length > max ? v.slice(0, max) : v;
}

/**
 * 이벤트 1건 저장. 예외는 던진다 — 호출측(라우트·서버 액션)이 try/catch 로 본 작업과 격리할지 정한다.
 * detail 에 개인정보 원문(휴대폰·이메일)을 넣지 말 것 — 콘솔 표에 그대로 노출된다.
 */
export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('security_events').insert({
    kind: input.kind,
    severity: input.severity,
    user_id: input.userId ?? null,
    ip_hash: clip(input.ipHash, 32),
    path: clip(input.path, 200),
    detail: (input.detail ?? {}) as Json,
  });
  if (error) throw new Error(error.message);
}

/** 본 작업을 막지 않는 기록 — 실패는 console.error 만 (서버 액션·라우트 응답 직전에 쓴다) */
export async function recordSecurityEventSafe(input: SecurityEventInput): Promise<void> {
  try {
    await recordSecurityEvent(input);
  } catch (e) {
    console.error('[security-events] 기록 실패', input.kind, e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------- 집계

export interface SecurityEventListItem {
  id: string;
  createdAt: string;
  kind: string;
  severity: SecuritySeverity;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  ipHash: string | null;
  path: string | null;
  detail: Json;
  alertedAt: string | null;
}

export interface SecurityEventCounts {
  /** kind → 건수 */
  byKind: Record<string, number>;
  /** severity → 건수 */
  bySeverity: Record<SecuritySeverity, number>;
  total: number;
}

export interface RecentSecurityEvents {
  hours: number;
  counts: SecurityEventCounts;
  /** 최근 순 (최대 `limit`) */
  rows: SecurityEventListItem[];
}

function countRows(rows: Pick<SecurityEventRow, 'kind' | 'severity'>[]): SecurityEventCounts {
  const byKind: Record<string, number> = {};
  const bySeverity: Record<SecuritySeverity, number> = { info: 0, warn: 0, critical: 0 };
  for (const r of rows) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    const sev = (r.severity as SecuritySeverity) in bySeverity ? (r.severity as SecuritySeverity) : 'info';
    bySeverity[sev] += 1;
  }
  return { byKind, bySeverity, total: rows.length };
}

/** 최근 N시간 종류·심각도별 건수 (표 하나 분량이라 최대 5,000건까지만 읽는다) */
export async function countSecurityEvents({ hours }: { hours: number }): Promise<SecurityEventCounts> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data, error } = await admin.from('security_events').select('kind, severity').gte('created_at', since).limit(5000);
  if (error) throw new Error(error.message);
  return countRows(data ?? []);
}

/** 최근 N시간 집계 + 최근 이벤트 목록(사용자 이름·이메일 포함) */
export async function listRecentSecurityEvents({ hours, limit = 100 }: { hours: number; limit?: number }): Promise<RecentSecurityEvents> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const [counts, { data, error }] = await Promise.all([
    countSecurityEvents({ hours }),
    admin.from('security_events').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(limit),
  ]);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v)));
  const names = new Map<string, { name: string; email: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await admin.from('users').select('id, name, email').in('id', userIds);
    for (const u of users ?? []) names.set(u.id, { name: u.name, email: u.email });
  }
  return {
    hours,
    counts,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      kind: r.kind,
      severity: (r.severity as SecuritySeverity) ?? 'info',
      userId: r.user_id,
      userName: r.user_id ? (names.get(r.user_id)?.name ?? null) : null,
      userEmail: r.user_id ? (names.get(r.user_id)?.email ?? null) : null,
      ipHash: r.ip_hash,
      path: r.path,
      detail: r.detail,
      alertedAt: r.alerted_at,
    })),
  };
}

// ---------------------------------------------------------------- 통보 (Cron security-alert)

export type UnalertedEvent = Pick<SecurityEventRow, 'id' | 'kind' | 'severity' | 'user_id' | 'ip_hash' | 'path' | 'created_at'>;

/** 최근 N분 내 생성됐고 아직 통보 처리(alerted_at)되지 않은 이벤트 (info 포함 — 승격 판정에 쓴다) */
export async function findUnalerted(minutes: number): Promise<UnalertedEvent[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await admin
    .from('security_events')
    .select('id, kind, severity, user_id, ip_hash, path, created_at')
    .is('alerted_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** 마지막 실제 통보 시각 (alerted_at 최대값). 없으면 null. */
export async function lastSecurityAlertAt(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('security_events')
    .select('alerted_at')
    .not('alerted_at', 'is', null)
    .order('alerted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.alerted_at ?? null;
}

/** 통보 처리 표시 — 쿨다운 중 생략한 건은 직전 통보 시각을 넣어 최대값이 마지막 실제 발송 시각을 유지하게 한다 (error-reports 와 동일) */
export async function markAlerted(ids: string[], at: string = new Date().toISOString()): Promise<void> {
  if (ids.length === 0) return;
  const admin = createAdminClient();
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await admin.from('security_events').update({ alerted_at: at }).in('id', ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
}

// ---------------------------------------------------------------- ⑤ 로그인 실패 폭주 파생 (login_attempts 는 P35-A 소유)

/** login_attempts 행의 컬럼명이 확정 전이라 넉넉히 해석한다 (ip_hash/ip, email/identifier/login, success/succeeded/ok/result) */
function normalizeAttempt(row: Record<string, unknown>): LoginAttemptLike | null {
  const createdAt = typeof row.created_at === 'string' ? row.created_at : typeof row.attempted_at === 'string' ? row.attempted_at : null;
  if (!createdAt) return null;
  const ipHash = (typeof row.ip_hash === 'string' && row.ip_hash) || (typeof row.ip === 'string' && row.ip) || null;
  // P35-A 확정 스키마(0086): identifier_hash(sha256) — 원문 식별자는 저장하지 않는다. 구 컬럼명은 호환용.
  const identifier =
    (typeof row.identifier_hash === 'string' && row.identifier_hash) ||
    (typeof row.email === 'string' && row.email) ||
    (typeof row.identifier === 'string' && row.identifier) ||
    (typeof row.login === 'string' && row.login) ||
    null;
  let failed: boolean | null = null;
  for (const k of ['success', 'succeeded', 'ok']) {
    if (typeof row[k] === 'boolean') {
      failed = !(row[k] as boolean);
      break;
    }
  }
  if (failed === null) {
    const r = typeof row.result === 'string' ? row.result : typeof row.outcome === 'string' ? row.outcome : typeof row.status === 'string' ? row.status : null;
    if (r) failed = !/^(ok|success|succeeded)$/i.test(r);
  }
  if (failed === null) failed = true; // 결과 컬럼을 못 찾으면 실패 기록만 쌓이는 표로 본다
  return { ip_hash: ipHash, identifier, failed, created_at: createdAt };
}

/**
 * login_attempts(P35-A) 를 읽어 로그인 실패 폭주를 `bruteforce`(critical) 이벤트로 만든다.
 * 표가 없거나 스키마가 다르면 조용히 0건 (try/catch) — 이 파일이 그 표를 소유하지 않는다.
 * 같은 IP 는 30분에 한 번만 만든다(중복 통보 방지).
 */
export async function deriveBruteforceEvents(): Promise<number> {
  const admin = createAdminClient();
  const windowMin = Math.max(ESCALATION.bruteforcePerIp.windowMin, ESCALATION.bruteforceAccounts.windowMin);
  const since = new Date(Date.now() - windowMin * 60_000).toISOString();
  let rows: Record<string, unknown>[];
  try {
    // 타입 생성 전 표라 from() 의 테이블 이름 유니온에 없다 — 구조적 타입으로 캐스팅해 호출
    type Loose = { from: (t: string) => { select: (c: string) => { gte: (c: string, v: string) => { limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }> } } } };
    const { data, error } = await (admin as unknown as Loose).from('login_attempts').select('*').gte('created_at', since).limit(5000);
    if (error) return 0;
    rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch {
    return 0;
  }
  const attempts = rows.map(normalizeAttempt).filter((a): a is LoginAttemptLike => !!a);
  const hits = detectBruteforce(attempts);
  if (hits.length === 0) return 0;

  const dedupeSince = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: recent } = await admin.from('security_events').select('ip_hash').eq('kind', 'bruteforce').gte('created_at', dedupeSince);
  const already = new Set((recent ?? []).map((r) => r.ip_hash).filter(Boolean));
  let created = 0;
  for (const h of hits) {
    if (already.has(h.ipHash)) continue;
    await recordSecurityEvent({
      kind: 'bruteforce',
      severity: 'critical',
      ipHash: h.ipHash,
      path: '/login',
      detail: { failures: h.failures, accounts: h.accounts, window_min: windowMin, source: 'login_attempts' },
    });
    created += 1;
  }
  return created;
}

// ---------------------------------------------------------------- ④ 권한 거부 리스너 (src/instrumentation.ts 가 서버 기동 시 등록)

/** denyUnless 리스너 본체 — 비동기 fire-and-forget. 실행자는 요청 캐시된 getRealSessionProfile() 로 얻는다(추가 DB 조회 없음). */
export function installDenyListener(): void {
  // 순환 import 방지: capabilities(순수) ← 여기(server-only) 방향만 허용되므로 동적으로 가져온다
  void import('@/lib/auth/capabilities').then(({ setDenyListener }) => {
    setDenyListener((holder, key) => {
      void (async () => {
        let userId: string | null = null;
        try {
          const { getRealSessionProfile } = await import('@/lib/auth/guards');
          userId = (await getRealSessionProfile())?.id ?? null;
        } catch {
          /* 요청 컨텍스트 밖(테스트 등)이면 사용자 없음 */
        }
        await recordSecurityEventSafe({
          kind: 'denied',
          severity: 'info',
          userId,
          detail: { capability: key, grade: holder?.grade ?? null, role: holder?.role ?? null, program_id: holder?.programId ?? null },
        });
      })();
    });
  });
}
