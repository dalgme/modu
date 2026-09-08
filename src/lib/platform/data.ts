import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';

export interface PlatformProgramItem {
  program: Tables<'programs'>;
  groups: number;
  cases: number;
  members: { nextlab: number; institution: number; mentor: number; mentee: number };
}

/** 플랫폼 콘솔 — 모든 행사 + 규모 요약 (service_role, 호출부 플랫폼 관리자 가드) */
export async function listAllPrograms(): Promise<PlatformProgramItem[]> {
  const admin = createAdminClient();
  const { data: programs } = await admin.from('programs').select('*').order('status').order('created_at', { ascending: false });
  const rows = programs ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id);
  const [{ data: groups }, { data: cases }, { data: members }] = await Promise.all([
    admin.from('support_types').select('program_id').in('program_id', ids),
    admin.from('cases').select('program_id').in('program_id', ids),
    admin.from('program_members').select('program_id, user_id, users!inner(role)').in('program_id', ids).eq('is_active', true),
  ]);
  return rows.map((p) => {
    const m = { nextlab: 0, institution: 0, mentor: 0, mentee: 0 };
    for (const x of members ?? []) {
      if (x.program_id !== p.id) continue;
      const role = (x.users as unknown as { role: keyof typeof m } | null)?.role;
      if (role && role in m) m[role] += 1;
    }
    return { program: p, groups: (groups ?? []).filter((g) => g.program_id === p.id).length, cases: (cases ?? []).filter((c) => c.program_id === p.id).length, members: m };
  });
}

export async function listPlatformAdmins(): Promise<Pick<Tables<'users'>, 'id' | 'name' | 'email' | 'role' | 'is_active'>[]> {
  const { data } = await createAdminClient().from('users').select('id, name, email, role, is_active').eq('is_platform_admin', true).order('name');
  return data ?? [];
}

export async function getProgramWithStaff(programId: string): Promise<{ program: Tables<'programs'>; staff: { id: string; name: string; email: string | null; role: string; is_active: boolean }[] } | null> {
  const admin = createAdminClient();
  const { data: program } = await admin.from('programs').select('*').eq('id', programId).maybeSingle();
  if (!program) return null;
  const { data: members } = await admin.from('program_members').select('user_id, users!inner(id, name, email, role, is_active)').eq('program_id', programId).eq('is_active', true);
  const staff = (members ?? [])
    .map((m) => m.users as unknown as { id: string; name: string; email: string | null; role: string; is_active: boolean })
    .filter((u) => u.role === 'nextlab' || u.role === 'institution')
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name, 'ko'));
  return { program, staff };
}

// ─────────────────────────────────────────────────────────────────────────────
// 플랫폼 통합 현황 · 계정 통합 조회 · 통합 감사로그 · 시스템 상태
// (전부 service_role — 호출부는 requirePlatformAdmin / platformAdmin() 가드. 행사 필터 없음 = 의도)
// ─────────────────────────────────────────────────────────────────────────────

import type { CaseStatus } from '@/types/case-status';
import type { UserRole } from '@/lib/auth/roles';

export interface ProgramOverviewRow {
  program: Pick<Tables<'programs'>, 'id' | 'name' | 'slug' | 'status' | 'client_name' | 'operator_name'>;
  groups: number;
  cases: number;
  byStatus: Partial<Record<CaseStatus, number>>;
  /** 처리 대기: 재배정 대기 + 종결 요청(검수 대기) + 지급 대기 */
  pending: { reassignment: number; review: number; settlement: number };
  settlementPendingNet: number;
  members: Record<UserRole, number>;
}

export interface PlatformOverview {
  programs: { active: number; ended: number };
  users: Record<UserRole, number> & { inactive: number; platformAdmins: number };
  cases: { total: number; inProgress: number; closed: number; withdrawn: number };
  settlements: { pendingNet: number; batchedNet: number; paidNet: number };
  notifications: { pending: number; failed7d: number; sent7d: number; lastSentAt: string | null };
  rows: ProgramOverviewRow[];
}

const emptyRoles = (): Record<UserRole, number> => ({ institution: 0, nextlab: 0, mentor: 0, mentee: 0 });

/** 통합 현황 — 행사별 케이스 상태 분포·처리 대기·정산 대기액 + 플랫폼 합계 */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const admin = createAdminClient();
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [{ data: programs }, { data: groups }, { data: cases }, { data: members }, { data: users }, { data: settlements }, { data: notifs }, { data: lastSent }] = await Promise.all([
    admin.from('programs').select('id, name, slug, status, client_name, operator_name').order('status').order('created_at', { ascending: false }),
    admin.from('support_types').select('program_id'),
    admin.from('cases').select('program_id, status'),
    admin.from('program_members').select('program_id, users!inner(role)').eq('is_active', true),
    admin.from('users').select('role, is_active, is_platform_admin'),
    admin.from('settlements').select('program_id, status, net'),
    admin.from('notifications').select('status, created_at').gte('created_at', since7d),
    admin.from('notifications').select('sent_at').not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(1),
  ]);
  const { count: pendingNotif } = await admin.from('notifications').select('id', { count: 'exact', head: true }).eq('status', 'pending');

  const rows: ProgramOverviewRow[] = (programs ?? []).map((p) => {
    const byStatus: Partial<Record<CaseStatus, number>> = {};
    let total = 0;
    for (const c of cases ?? []) {
      if (c.program_id !== p.id) continue;
      total += 1;
      const s = c.status as CaseStatus;
      byStatus[s] = (byStatus[s] ?? 0) + 1;
    }
    const m = emptyRoles();
    for (const x of members ?? []) {
      if (x.program_id !== p.id) continue;
      const role = (x.users as unknown as { role: UserRole } | null)?.role;
      if (role && role in m) m[role] += 1;
    }
    const pendingNet = (settlements ?? []).filter((s) => s.program_id === p.id && s.status === 'pending').reduce((a, s) => a + Number(s.net ?? 0), 0);
    return {
      program: p,
      groups: (groups ?? []).filter((g) => g.program_id === p.id).length,
      cases: total,
      byStatus,
      pending: { reassignment: byStatus.reassignment_pending ?? 0, review: byStatus.closure_requested ?? 0, settlement: byStatus.settlement_pending ?? 0 },
      settlementPendingNet: pendingNet,
      members: m,
    };
  });

  const u = { ...emptyRoles(), inactive: 0, platformAdmins: 0 };
  for (const x of users ?? []) {
    if (x.role in u) u[x.role as UserRole] += 1;
    if (!x.is_active) u.inactive += 1;
    if (x.is_platform_admin) u.platformAdmins += 1;
  }
  const IN_PROGRESS: CaseStatus[] = ['mentor_assigned', 'in_progress', 'reassignment_pending', 'closure_requested', 'revision_requested'];
  const sumNet = (st: string) => (settlements ?? []).filter((s) => s.status === st).reduce((a, s) => a + Number(s.net ?? 0), 0);
  return {
    programs: { active: rows.filter((r) => r.program.status === 'active').length, ended: rows.filter((r) => r.program.status !== 'active').length },
    users: u,
    cases: {
      total: (cases ?? []).length,
      inProgress: (cases ?? []).filter((c) => IN_PROGRESS.includes(c.status as CaseStatus)).length,
      closed: (cases ?? []).filter((c) => c.status === 'closed').length,
      withdrawn: (cases ?? []).filter((c) => c.status === 'withdrawn').length,
    },
    settlements: { pendingNet: sumNet('pending'), batchedNet: sumNet('batched') + sumNet('confirmed'), paidNet: sumNet('paid') },
    notifications: {
      pending: pendingNotif ?? 0,
      failed7d: (notifs ?? []).filter((n) => n.status === 'failed').length,
      sent7d: (notifs ?? []).filter((n) => n.status === 'sent' || n.status === 'fallback_sent').length,
      lastSentAt: lastSent?.[0]?.sent_at ?? null,
    },
    rows,
  };
}

export interface PlatformUserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  is_platform_admin: boolean;
  must_change_password: boolean;
  created_at: string;
  activated_at: string | null;
  /** 활성 멤버십 행사 (id·이름) */
  programs: { id: string; name: string; status: string }[];
}

export interface UserSearch {
  q?: string;
  role?: UserRole | '';
  programId?: string;
  /** 'none' = 어떤 행사에도 속하지 않은 계정 */
  membership?: 'any' | 'none' | '';
  inactiveOnly?: boolean;
}

/** 계정 통합 조회 — 전 행사 검색 (최대 200건, 최신 순) */
export async function searchPlatformUsers(f: UserSearch): Promise<{ rows: PlatformUserRow[]; total: number; programs: { id: string; name: string; status: string }[] }> {
  const admin = createAdminClient();
  let q = admin.from('users').select('id, name, email, phone, role, is_active, is_platform_admin, must_change_password, created_at, activated_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(200);
  if (f.role) q = q.eq('role', f.role);
  if (f.inactiveOnly) q = q.eq('is_active', false);
  const term = f.q?.trim();
  if (term) {
    const esc = term.replace(/[%_,]/g, '');
    q = q.or(`name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc.replace(/\D/g, '') || esc}%`);
  }
  const [{ data: users, count }, { data: programs }, { data: memberships }] = await Promise.all([
    q,
    admin.from('programs').select('id, name, status').order('created_at', { ascending: false }),
    admin.from('program_members').select('user_id, program_id').eq('is_active', true),
  ]);
  const pById = new Map((programs ?? []).map((p) => [p.id, p]));
  const memByUser = new Map<string, { id: string; name: string; status: string }[]>();
  for (const m of memberships ?? []) {
    const p = pById.get(m.program_id);
    if (!p) continue;
    (memByUser.get(m.user_id) ?? memByUser.set(m.user_id, []).get(m.user_id)!).push(p);
  }
  let rows: PlatformUserRow[] = (users ?? []).map((u) => ({ ...u, role: u.role as UserRole, programs: memByUser.get(u.id) ?? [] }));
  if (f.programId) rows = rows.filter((r) => r.programs.some((p) => p.id === f.programId));
  if (f.membership === 'none') rows = rows.filter((r) => r.programs.length === 0);
  return { rows, total: count ?? rows.length, programs: programs ?? [] };
}

export interface PlatformAuditRow {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
  actorName: string | null;
  programName: string | null;
  onBehalfOfName: string | null;
}

/** 통합 감사로그 — 행사 무관 전체 (최근 N건, 행사·액션 접두 필터) */
export async function listPlatformAudit(f: { programId?: string; action?: string; limit?: number }): Promise<{ rows: PlatformAuditRow[]; actions: string[] }> {
  const admin = createAdminClient();
  let q = admin.from('audit_logs').select('id, created_at, action, entity_type, entity_id, metadata, actor_id, program_id').order('created_at', { ascending: false }).limit(Math.min(f.limit ?? 200, 500));
  if (f.programId === 'platform') q = q.is('program_id', null);
  else if (f.programId) q = q.eq('program_id', f.programId);
  if (f.action) q = q.ilike('action', `${f.action.replace(/[%_]/g, '')}%`);
  const [{ data: logs }, { data: programs }, { data: actionRows }] = await Promise.all([q, admin.from('programs').select('id, name'), admin.from('audit_logs').select('action').order('created_at', { ascending: false }).limit(2000)]);
  const onBehalf = (m: unknown): string | null => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    const v = (m as Record<string, unknown>).on_behalf_of;
    return typeof v === 'string' ? v : null;
  };
  const ids = new Set<string>();
  for (const l of logs ?? []) {
    if (l.actor_id) ids.add(l.actor_id);
    const ob = onBehalf(l.metadata);
    if (ob) ids.add(ob);
  }
  const { data: users } = ids.size ? await admin.from('users').select('id, name').in('id', Array.from(ids)) : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const pName = new Map((programs ?? []).map((p) => [p.id, p.name]));
  const prefixes = new Set<string>();
  for (const a of actionRows ?? []) prefixes.add(a.action.split('.')[0] ?? a.action);
  return {
    rows: (logs ?? []).map((l) => ({
      id: l.id,
      created_at: l.created_at,
      action: l.action,
      entity_type: l.entity_type,
      entity_id: l.entity_id,
      metadata: l.metadata,
      actorName: l.actor_id ? (nameById.get(l.actor_id) ?? '알 수 없음') : null,
      programName: l.program_id ? (pName.get(l.program_id) ?? null) : null,
      onBehalfOfName: (() => {
        const ob = onBehalf(l.metadata);
        return ob ? (nameById.get(ob) ?? '멘토') : null;
      })(),
    })),
    actions: Array.from(prefixes).sort(),
  };
}

export interface SystemStatus {
  deployment: { env: string | null; region: string | null; commit: string | null; branch: string | null; appUrl: string | null; supabaseHost: string | null; nodeVersion: string };
  /** 환경변수 존재 여부만 (값은 절대 노출하지 않는다) */
  config: { key: string; label: string; present: boolean; level: 'required' | 'recommended' | 'optional' | 'must_absent' }[];
  notifications: { pending: number; failed7d: number; sent7d: number; lastSentAt: string | null; oldestPendingAt: string | null };
  sms: { programsWithOwnApi: number; programsTotal: number; platformFallback: boolean };
  ai: { configured: boolean; recommendations30d: number };
  storage: { documents: number };
}

/** 시스템 상태 — 배포 정보·설정 존재 여부·Cron 생존(마지막 발송)·행사별 문자 API 등록 현황 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const admin = createAdminClient();
  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();
  const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
  const has = (k: string) => !!process.env[k]?.trim();
  const smtpAll = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].every(has);
  const [{ data: notifs }, { data: lastSent }, { data: oldestPending }, { count: pendingCount }, { count: smsPrograms }, { count: programsTotal }, { count: recs }, { count: docs }] = await Promise.all([
    admin.from('notifications').select('status').gte('created_at', since7d),
    admin.from('notifications').select('sent_at').not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(1),
    admin.from('notifications').select('created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(1),
    admin.from('notifications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('program_sms_settings').select('program_id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('programs').select('id', { count: 'exact', head: true }),
    admin.from('match_recommendations').select('id', { count: 'exact', head: true }).gte('created_at', since30d),
    admin.from('documents').select('id', { count: 'exact', head: true }),
  ]);
  let supabaseHost: string | null = null;
  try {
    supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : null;
  } catch {
    supabaseHost = null;
  }
  return {
    deployment: {
      env: process.env.VERCEL_ENV ?? null,
      region: process.env.VERCEL_REGION ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      supabaseHost,
      nodeVersion: process.version,
    },
    config: [
      { key: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL', present: has('NEXT_PUBLIC_SUPABASE_URL'), level: 'required' },
      { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase anon 키', present: has('NEXT_PUBLIC_SUPABASE_ANON_KEY'), level: 'required' },
      { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase service_role 키', present: has('SUPABASE_SERVICE_ROLE_KEY'), level: 'required' },
      { key: 'NEXT_PUBLIC_APP_URL', label: '앱 주소 (문자·이메일 링크)', present: has('NEXT_PUBLIC_APP_URL'), level: 'required' },
      { key: 'CRON_SECRET', label: 'Cron 인증', present: has('CRON_SECRET'), level: 'required' },
      { key: 'VIEW_AS_SECRET', label: '대행·컨텍스트 쿠키 서명', present: has('VIEW_AS_SECRET'), level: 'recommended' },
      { key: 'SMS_KEK', label: '행사별 문자 API 암호화 키', present: has('SMS_KEK'), level: 'recommended' },
      { key: 'SOLAPI_API_KEY', label: '플랫폼 기본 문자 발신 (폴백)', present: has('SOLAPI_API_KEY') && has('SOLAPI_API_SECRET') && has('SOLAPI_SENDER_NUMBER_1'), level: 'optional' },
      { key: 'SMTP_*', label: '이메일 알림 (SMTP 5종)', present: smtpAll, level: 'optional' },
      { key: 'ANTHROPIC_API_KEY', label: 'AI 매칭 정성 근거', present: has('ANTHROPIC_API_KEY'), level: 'optional' },
      { key: 'BOOTSTRAP_TOKEN', label: '부트스트랩 토큰 (운영 중에는 삭제)', present: has('BOOTSTRAP_TOKEN'), level: 'must_absent' },
    ],
    notifications: {
      pending: pendingCount ?? 0,
      failed7d: (notifs ?? []).filter((n) => n.status === 'failed').length,
      sent7d: (notifs ?? []).filter((n) => n.status === 'sent' || n.status === 'fallback_sent').length,
      lastSentAt: lastSent?.[0]?.sent_at ?? null,
      oldestPendingAt: oldestPending?.[0]?.created_at ?? null,
    },
    sms: { programsWithOwnApi: smsPrograms ?? 0, programsTotal: programsTotal ?? 0, platformFallback: has('SOLAPI_API_KEY') && has('SOLAPI_API_SECRET') },
    ai: { configured: has('ANTHROPIC_API_KEY'), recommendations30d: recs ?? 0 },
    storage: { documents: docs ?? 0 },
  };
}
