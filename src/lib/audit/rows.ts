import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { AuditRow } from '@/components/audit/audit-table';

function onBehalfOf(m: unknown): string | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const v = (m as Record<string, unknown>).on_behalf_of;
  return typeof v === 'string' ? v : null;
}

/** (P31) 서버 필터 파라미터 — 표 UI(searchParams)·엑셀 라우트가 같은 모양을 쓴다 */
export interface AuditQuery {
  /** KST 날짜 YYYY-MM-DD (양끝 포함) → UTC 로 변환해 조회 */
  from?: string | null;
  to?: string | null;
  /** 수행자 user id */
  actor?: string | null;
  /** action 접두(예: 'batch.' 'settlement.' 'case.') 또는 정확한 액션 */
  actionPrefix?: string | null;
  entityId?: string | null;
  /** 액션 코드·메타데이터 텍스트 검색(서버, ilike) */
  q?: string | null;
  limit?: number;
  offset?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const AUDIT_PAGE_SIZE = 200;
export const AUDIT_MAX_LIMIT = 1000;

/** URL searchParams → AuditQuery (잘못된 값은 무시) */
export function parseAuditQuery(sp: Record<string, string | string[] | undefined>, prefix = 'audit_'): AuditQuery {
  const get = (k: string) => {
    const v = sp[`${prefix}${k}`];
    return typeof v === 'string' ? v.trim() : '';
  };
  const page = Math.max(1, Number(get('page')) || 1);
  return {
    from: DATE_RE.test(get('from')) ? get('from') : null,
    to: DATE_RE.test(get('to')) ? get('to') : null,
    actor: UUID_RE.test(get('actor')) ? get('actor') : null,
    actionPrefix: /^[a-z0-9_.]{1,60}$/i.test(get('action')) ? get('action') : null,
    entityId: get('entity') ? get('entity').slice(0, 80) : null,
    q: get('q') ? get('q').slice(0, 80) : null,
    limit: AUDIT_PAGE_SIZE,
    offset: (page - 1) * AUDIT_PAGE_SIZE,
  };
}

function applyFilters<T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T; eq: (c: string, v: string) => T; like: (c: string, v: string) => T; or: (f: string) => T }>(q: T, p: AuditQuery): T {
  let out = q;
  if (p.from) out = out.gte('created_at', new Date(`${p.from}T00:00:00+09:00`).toISOString());
  if (p.to) out = out.lte('created_at', new Date(`${p.to}T23:59:59.999+09:00`).toISOString());
  if (p.actor) out = out.eq('actor_id', p.actor);
  if (p.actionPrefix) out = out.like('action', `${p.actionPrefix.replace(/[%_]/g, '')}%`);
  if (p.entityId) out = out.eq('entity_id', p.entityId);
  if (p.q) {
    const needle = p.q.replace(/[%_,()]/g, ' ').trim();
    // PostgREST 필터에는 `::text` 캐스트를 쓸 수 없다 → 액션 코드·대상 id 로만 검색 (P32 리뷰 #3)
    if (needle) out = out.or(`action.ilike.%${needle}%,entity_id.ilike.%${needle}%`);
  }
  return out;
}

/** 조건에 맞는 전체 건수 (페이지네이션용) */
export async function countProgramAuditRows(programId: string, params: AuditQuery = {}): Promise<number> {
  const admin = createAdminClient();
  const q = applyFilters(admin.from('audit_logs').select('id', { count: 'exact', head: true }).eq('program_id', programId), params);
  const { count } = await q;
  return count ?? 0;
}

/** 필터 셀렉트용 — 이 행사 감사로그에 등장한 수행자 목록 */
export async function listAuditActors(programId: string): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data: members } = await admin.from('program_members').select('user_id, users!inner(name)').eq('program_id', programId);
  const out = (members ?? []).map((m) => ({ id: m.user_id, name: (m.users as unknown as { name: string } | null)?.name ?? '-' }));
  return out.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/**
 * 행사 범위 감사로그 표 데이터 — 행사 감사로그 페이지·운영 설정 [감사 로그] 탭·엑셀 라우트 공용.
 * (P31) 서버 필터(기간 KST→UTC·수행자·액션 접두·대상·검색·limit/offset). 예전 호출 `(programId, { limit })` / `(programId, 500)` 도 그대로 동작.
 * 호출부에서 requireStaff/requireNextlab + requireContext 로 권한·범위를 강제한다.
 */
export async function loadProgramAuditRows(programId: string, opts: AuditQuery | number = {}): Promise<AuditRow[]> {
  const params: AuditQuery = typeof opts === 'number' ? { limit: opts } : opts;
  const limit = Math.min(params.limit ?? 500, AUDIT_MAX_LIMIT);
  const offset = Math.max(0, params.offset ?? 0);
  const admin = createAdminClient();
  const q = applyFilters(
    admin.from('audit_logs').select('id, actor_id, action, entity_type, entity_id, created_at, metadata, program_id').eq('program_id', programId),
    params,
  );
  const { data: logs, error } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) console.error('[audit] list failed', error.message);

  const ids = new Set<string>();
  for (const l of logs ?? []) {
    if (l.actor_id) ids.add(l.actor_id);
    const ob = onBehalfOf(l.metadata);
    if (ob) ids.add(ob);
  }
  // 대상(entity) 이름 — users / cases 는 이름을 붙여 표에 "대상" 으로 보여준다
  const userTargets = new Set<string>();
  const caseTargets = new Set<string>();
  for (const l of logs ?? []) {
    if (!l.entity_id) continue;
    if (l.entity_type === 'users') userTargets.add(l.entity_id);
    else if (l.entity_type === 'cases') caseTargets.add(l.entity_id);
  }
  const allUserIds = Array.from(new Set(Array.from(ids).concat(Array.from(userTargets))));
  const [{ data: users }, { data: cases }] = await Promise.all([
    allUserIds.length ? admin.from('users').select('id, name').in('id', allUserIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    caseTargets.size ? admin.from('cases').select('id, owner_name, business_name').in('id', Array.from(caseTargets)) : Promise.resolve({ data: [] as { id: string; owner_name: string; business_name: string }[] }),
  ]);
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const caseName = new Map((cases ?? []).map((c) => [c.id, c.business_name && c.business_name !== c.owner_name ? `${c.owner_name}/${c.business_name}` : c.owner_name]));

  return (logs ?? []).map((l) => ({
    id: l.id,
    created_at: l.created_at,
    action: l.action,
    entity_type: l.entity_type,
    entity_id: l.entity_id,
    metadata: l.metadata,
    actor_id: l.actor_id,
    program_id: l.program_id,
    actorName: l.actor_id ? (nameById.get(l.actor_id) ?? '알 수 없음') : null,
    targetName: l.entity_id ? (l.entity_type === 'users' ? (nameById.get(l.entity_id) ?? null) : l.entity_type === 'cases' ? (caseName.get(l.entity_id) ?? null) : null) : null,
    onBehalfOfName: (() => {
      const ob = onBehalfOf(l.metadata);
      return ob ? (nameById.get(ob) ?? '멘토') : null;
    })(),
  }));
}
