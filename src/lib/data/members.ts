import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';
import type { UserRole } from '@/lib/auth/roles';
import { mentorEligibleForGroup } from '@/lib/matching/eligibility';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { listMentorDocStatus } from '@/lib/mentor-docs/data';
import { normalizePhone } from '@/lib/utils/phone';
import type { LoginGuideRecipient } from '@/lib/sms/login-guide-template';
import { menteeOrg } from '@/lib/utils/labels';
import { FORCE_END_REQUIRED_STATUSES, requiresForceEnd, type ForceEndBlock } from '@/lib/workflow/force-end-rule';
import type { CaseStatus } from '@/types/case-status';

export interface MentorLoad {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** 현재까지 배정받은 멘티(케이스) 수 — 중복 케이스 제외 */
  menteeCount: number;
  /** 지급서류(이력서·통장·신분증) 제출(멘토 업로드) 수 0~3 */
  docsSubmitted: number;
  /** 지급서류 수령 확인(운영사 체크) 수 0~3 */
  docsReceived: number;
  /** (P32) 멘토 서류 수령 체크 — 유효 체크리스트가 사용 중일 때만 { received, total }, 아니면 null */
  checklist: { received: number; total: number } | null;
}

/**
 * 멘토 현황: 멘토별 이름·이메일·연락처 + 배정받은 멘티(케이스) 수.
 * (운영진 열람 — RLS 로 접근 제어) 활성 멘토만, 이름순.
 */
export async function listMentorsWithLoad(programId: string): Promise<MentorLoad[]> {
  const admin = createAdminClient();
  // 이 행사에서 역할이 멘토인 소속 (설계 B: program_members.role)
  const members = await fetchAll<{ user_id: string }>((from, to) => admin.from('program_members').select('user_id').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true).range(from, to));
  const ids = members.map((m) => m.user_id);
  if (ids.length === 0) return [];
  // (P31) in() 200개 청크 + 1,000행 캡 안전
  const [mentors, assigns, docs] = await Promise.all([
    fetchAllIn<{ id: string; name: string; email: string | null; phone: string | null }>(ids, (chunk, from, to) => admin.from('users').select('id, name, email, phone').in('id', chunk).eq('is_active', true).order('name').range(from, to)),
    fetchAllIn<{ mentor_id: string; case_id: string; cases: { program_id: string } | null }>(ids, (chunk, from, to) => admin.from('mentor_assignments').select('mentor_id, case_id, cases!inner(program_id)').in('mentor_id', chunk).eq('is_active', true).range(from, to)),
    fetchAllIn<{ user_id: string; resume_uploaded_at: string | null; bankbook_uploaded_at: string | null; id_card_uploaded_at: string | null; resume_received_at: string | null; bankbook_received_at: string | null; id_card_received_at: string | null }>(ids, (chunk, from, to) =>
      admin.from('mentor_payment_docs').select('user_id, resume_uploaded_at, bankbook_uploaded_at, id_card_uploaded_at, resume_received_at, bankbook_received_at, id_card_received_at').eq('program_id', programId).in('user_id', chunk).range(from, to),
    ),
  ]);
  mentors.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  // 멘토별 이 행사 케이스의 활성 배정(중복 제외) 집계
  const casesByMentor = new Map<string, Set<string>>();
  for (const a of assigns) {
    if (a.cases?.program_id !== programId) continue;
    if (!casesByMentor.has(a.mentor_id)) casesByMentor.set(a.mentor_id, new Set());
    casesByMentor.get(a.mentor_id)!.add(a.case_id);
  }

  const docsByUser = new Map(docs.map((d) => [d.user_id, d]));
  // (P32) 서류 수령 체크 현황 (행사 전체 범위 — 멘토별 유효 체크리스트 기준)
  const docStatus = await listMentorDocStatus(programId, null);
  const checklistByMentor = new Map<string, { received: number; total: number }>();
  for (const s of docStatus.sections) {
    if (!s.enabled) continue;
    for (const r of s.mentors) checklistByMentor.set(r.mentorId, { received: r.receivedCount, total: r.total });
  }
  return mentors.map((m) => {
    const d = docsByUser.get(m.id);
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      menteeCount: casesByMentor.get(m.id)?.size ?? 0,
      docsSubmitted: d ? [d.resume_uploaded_at, d.bankbook_uploaded_at, d.id_card_uploaded_at].filter(Boolean).length : 0,
      docsReceived: d ? [d.resume_received_at, d.bankbook_received_at, d.id_card_received_at].filter(Boolean).length : 0,
      checklist: checklistByMentor.get(m.id) ?? null,
    };
  });
}

export type MemberRow = Pick<
  Tables<'users'>,
  | 'id'
  | 'email'
  | 'name'
  | 'phone'
  | 'role'
  | 'is_active'
  | 'must_change_password'
  | 'invited_at'
  | 'activated_at'
  | 'created_at'
> & {
  /** 계정 기본 역할 (users.role). `role` 은 이 행사에서의 역할 */
  primaryRole: UserRole;
  /** 이 행사 소속 활성 여부 */
  memberActive: boolean;
  joinedAt: string;
  /** 직위 (발주처·운영사 담당자) */
  position: string | null;
  /** 운영사 등급 (nextlab) */
  grade: string | null;
  /** 이 행사 담당역할 메모 */
  duty: string | null;
  /** 소속 (멘토의 회사·기관, 담당자의 부서). 멘티는 케이스의 기업(팀)명 */
  organization: string | null;
  /** 멘토: 이 행사에서 활성 배정된 멘티 수 (0 = Pool 대기) */
  assignedCount: number;
  /** 로그인 안내 문자 최초 발송 일시 (audit_logs 기반) */
  guideSentAt: string | null;
  /** 비고 — 발주처·운영사는 program_members.note, 멘토는 mentor_profiles.note (멘티는 케이스별 mentee_profiles.note) */
  note: string | null;
};

/** 로그인 안내 문자 발송 기록용 audit_logs action (스키마 변경 없이 발송 여부 추적) */
export const LOGIN_GUIDE_SMS_ACTION = 'sms.login_guide';

/** 역할 표시 정렬 순서 (운영사 → 발주처 → 멘토 → 멘티) */
const ROLE_ORDER: Record<UserRole, number> = {
  nextlab: 0,
  institution: 1,
  mentor: 2,
  mentee: 3,
};

/**
 * 이 행사의 회원 목록 (운영사 전용). 역할은 **행사 안 역할**(program_members.role, 설계 B).
 * service_role 로 조회 — 호출부(page)에서 requireNextlab + requireContext 로 권한·범위 강제.
 */
/**
 * 행사 회원 명단. supportTypeId(그룹 범위, P25)를 주면:
 *  - 멘티 = 그 그룹에 케이스가 있는 사람만
 *  - 멘토 = 그 그룹 명부(support_type_members)에 있거나 그 그룹에 활성 배정이 있는 사람만, assignedCount 도 그룹 기준
 *  - 발주처·운영사 = 행사 소속 그대로
 */
export async function listProgramMembers(programId: string, supportTypeId?: string | null): Promise<MemberRow[]> {
  const admin = createAdminClient();
  const memberships = await fetchAll<{ user_id: string; role: string; is_active: boolean; joined_at: string; grade: string | null; duty: string | null; note: string | null }>((from, to) =>
    admin.from('program_members').select('user_id, role, is_active, joined_at, grade, duty, note').eq('program_id', programId).order('joined_at', { ascending: true }).range(from, to),
  );
  const ids = memberships.map((m) => m.user_id);
  if (ids.length === 0) return [];
  // (P31) 전부 청크·페이지 안전 — 멘티 400명 규모에서 users/audit_logs 조회가 1,000행 캡·URL 길이에 잘리지 않게
  type UserLite = Pick<Tables<'users'>, 'id' | 'email' | 'name' | 'phone' | 'role' | 'is_active' | 'must_change_password' | 'invited_at' | 'activated_at' | 'created_at' | 'position' | 'organization'>;
  const [users, assigns, guides, menteeCases, groupRoster, mentorNotes] = await Promise.all([
    fetchAllIn<UserLite>(ids, (chunk, from, to) => admin.from('users').select('id, email, name, phone, role, is_active, must_change_password, invited_at, activated_at, created_at, position, organization').in('id', chunk).range(from, to)),
    fetchAllIn<{ mentor_id: string; case_id: string; notice_sent_at: string | null; cases: { program_id: string; support_type_id: string } | null }>(ids, (chunk, from, to) =>
      admin.from('mentor_assignments').select('mentor_id, case_id, notice_sent_at, cases!inner(program_id, support_type_id)').in('mentor_id', chunk).eq('is_active', true).eq('cases.program_id', programId).range(from, to),
    ),
    fetchAllIn<{ entity_id: string | null; created_at: string }>(ids, (chunk, from, to) =>
      admin.from('audit_logs').select('entity_id, created_at').eq('action', LOGIN_GUIDE_SMS_ACTION).eq('program_id', programId).eq('entity_type', 'users').in('entity_id', chunk).order('created_at', { ascending: true }).range(from, to),
    ),
    fetchAll<{ mentee_id: string | null; business_name: string; support_type_id: string; created_at: string }>((from, to) => admin.from('cases').select('mentee_id, business_name, support_type_id, created_at').eq('program_id', programId).not('mentee_id', 'is', null).order('created_at', { ascending: false }).range(from, to)),
    supportTypeId
      ? fetchAll<{ user_id: string; support_type_id: string }>((from, to) => admin.from('support_type_members').select('user_id, support_type_id, support_types!inner(program_id)').eq('is_active', true).eq('member_role', 'mentor').eq('support_types.program_id', programId).range(from, to))
      : Promise.resolve([] as { user_id: string; support_type_id: string }[]),
    fetchAllIn<{ user_id: string; note: string | null }>(ids, (chunk, from, to) => admin.from('mentor_profiles').select('user_id, note').eq('program_id', programId).in('user_id', chunk).range(from, to)),
  ]);
  const mentorNote = new Map(mentorNotes.map((p) => [p.user_id, p.note]));
  const inScopeAssign = (a: { cases: { support_type_id: string } | null }) => !supportTypeId || a.cases?.support_type_id === supportTypeId;
  const assignedCount = new Map<string, number>();
  for (const a of assigns) if (inScopeAssign(a)) assignedCount.set(a.mentor_id, (assignedCount.get(a.mentor_id) ?? 0) + 1);
  const menteeInScope = new Set(menteeCases.filter((c) => !supportTypeId || c.support_type_id === supportTypeId).map((c) => c.mentee_id as string));
  // 멘토 그룹 지정 규칙: 지정이 하나도 없으면 모든 그룹에서 사용(복제), 있으면 지정 그룹에서만
  const designated = new Map<string, Set<string>>();
  for (const r of groupRoster) (designated.get(r.user_id) ?? designated.set(r.user_id, new Set()).get(r.user_id)!).add(r.support_type_id);
  const mentorInScope = (id: string) => !supportTypeId || mentorEligibleForGroup(designated.get(id) ?? new Set(), supportTypeId) || assignedCount.has(id);
  const guideAt = new Map<string, string>();
  for (const g of guides.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (g.entity_id && !guideAt.has(g.entity_id)) guideAt.set(g.entity_id, g.created_at);
  }
  // 전원 배정 시 자동 발송된 멘토 로그인 안내(mentor_assignments.notice_sent_at)도 "안내 발송"으로 친다 (P28)
  for (const a of assigns) {
    const at = a.notice_sent_at;
    if (at && !guideAt.has(a.mentor_id)) guideAt.set(a.mentor_id, at);
  }
  const businessOf = new Map<string, string>();
  for (const c of menteeCases) {
    if (c.mentee_id && !businessOf.has(c.mentee_id)) businessOf.set(c.mentee_id, c.business_name);
  }
  const byId = new Map(users.map((u) => [u.id, u]));
  const rows: MemberRow[] = [];
  for (const m of memberships) {
    const u = byId.get(m.user_id);
    if (!u) continue;
    const role = m.role as UserRole;
    if (supportTypeId && role === 'mentee' && !menteeInScope.has(u.id)) continue;
    if (supportTypeId && role === 'mentor' && !mentorInScope(u.id)) continue;
    rows.push({
      ...u,
      primaryRole: u.role,
      role,
      memberActive: m.is_active,
      joinedAt: m.joined_at,
      position: u.position,
      grade: m.grade,
      duty: m.duty,
      organization: role === 'mentee' ? u.organization ?? businessOf.get(u.id) ?? null : u.organization,
      assignedCount: assignedCount.get(u.id) ?? 0,
      guideSentAt: guideAt.get(u.id) ?? null,
      note: role === 'mentor' ? (mentorNote.get(u.id) ?? null) : role === 'mentee' ? null : (m.note ?? null),
    });
  }
  // 역할 순 → 이름 가나다순 (P25-11)
  return rows.sort((a, b) => {
    const r = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    return r !== 0 ? r : a.name.localeCompare(b.name, 'ko');
  });
}

/** 단일 회원 조회 (view-as 대상 확인용). */
export async function getMemberById(userId: string): Promise<Tables<'users'> | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('users').select('*').eq('id', userId).maybeSingle();
  return data ?? null;
}

/** 문자 수신 대상 (소속=역할, 성명, 연락처) */
export interface SmsRecipient {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  /** 멘티의 경우 소속 기업명 (수신인 목록 비고용). 그 외 null */
  businessName?: string | null;
}

/**
 * 문자 발송 수신 대상 목록: 활성·휴대폰 보유 회원 (운영사 전용 호출부 가드).
 * 역할순(운영사→발주처→멘토→멘티) 정렬. 멘티는 소속 기업명을 함께 반환.
 */
export async function listSmsRecipients(programId: string, supportTypeId?: string | null): Promise<SmsRecipient[]> {
  const admin = createAdminClient();
  // 이 행사 소속만, 역할은 행사 안 역할 (설계 B). 그룹 범위(P25)면 멘티·멘토는 그 그룹 기준으로 좁힌다.
  const memberships = await fetchAll<{ user_id: string; role: string }>((from, to) => admin.from('program_members').select('user_id, role').eq('program_id', programId).eq('is_active', true).range(from, to));
  const roleOf = new Map(memberships.map((m) => [m.user_id, m.role as UserRole]));
  if (supportTypeId) {
    const scoped = await listProgramMembers(programId, supportTypeId);
    const allowed = new Set(scoped.map((m) => m.id));
    for (const [id, role] of Array.from(roleOf.entries())) {
      if ((role === 'mentee' || role === 'mentor') && !allowed.has(id)) roleOf.delete(id);
    }
  }
  const ids = Array.from(roleOf.keys());
  const data = await fetchAllIn<{ id: string; name: string; phone: string | null; is_active: boolean }>(ids, (chunk, from, to) => admin.from('users').select('id, name, phone, is_active').in('id', chunk).eq('is_active', true).not('phone', 'is', null).range(from, to));
  const rows = data
    .filter((u) => !!normalizePhone(u.phone))
    .map((u) => ({ ...u, role: roleOf.get(u.id)! }));

  // 멘티 소속 기업명 매핑 (mentee_id → business_name) — 이 행사 케이스만
  const menteeIds = rows.filter((u) => u.role === 'mentee').map((u) => u.id);
  const businessByMentee = new Map<string, string>();
  if (menteeIds.length) {
    const cases = await fetchAllIn<{ mentee_id: string | null; business_name: string; created_at: string }>(menteeIds, (chunk, from, to) =>
      admin.from('cases').select('mentee_id, business_name, created_at').eq('program_id', programId).in('mentee_id', chunk).order('created_at', { ascending: false }).range(from, to),
    );
    for (const c of cases) {
      if (c.mentee_id && !businessByMentee.has(c.mentee_id)) {
        businessByMentee.set(c.mentee_id, c.business_name);
      }
    }
  }

  return rows
    .map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone as string,
      role: u.role,
      businessName: u.role === 'mentee' ? businessByMentee.get(u.id) ?? null : null,
    }))
    .sort((a, b) => {
      const r = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      return r !== 0 ? r : a.name.localeCompare(b.name, 'ko');
    });
}

/* ── 비활성화 탭 (행사 비활성화·계정 잠금) ─────────────────────────────── */

/** 회원이 일반 명단(멘티/멘토/발주처/운영사 탭)에 보이는지 — 행사 소속 활성 + 계정 활성 둘 다여야 한다 */
export function isRosterActive(m: Pick<MemberRow, 'memberActive' | 'is_active'>): boolean {
  return m.memberActive && m.is_active;
}

export interface DeactivationInfo {
  /** 가장 최근 '이 행사 비활성화' 또는 '소속 해제' 시각 */
  memberAt: string | null;
  /** 마지막 기록이 소속 해제(membership.remove)였는지 */
  removed: boolean;
  /** 가장 최근 계정 잠금 시각 */
  accountAt: string | null;
}

/**
 * 비활성화 시각 — audit_logs 의 membership.deactivate / membership.remove / account.deactivate (행사 범위) 최신값.
 * 비활성 회원만 넘기므로 조회량이 작다. 기록이 없으면(오래된 데이터·다른 경로) null.
 */
export async function loadDeactivationInfo(programId: string, userIds: string[]): Promise<Record<string, DeactivationInfo>> {
  const out: Record<string, DeactivationInfo> = {};
  if (userIds.length === 0) return out;
  const admin = createAdminClient();
  const rows = await fetchAllIn<{ entity_id: string | null; action: string; created_at: string }>(userIds, (chunk, from, to) =>
    admin
      .from('audit_logs')
      .select('entity_id, action, created_at')
      .eq('program_id', programId)
      .eq('entity_type', 'users')
      .in('action', ['membership.deactivate', 'membership.remove', 'account.deactivate'])
      .in('entity_id', chunk)
      .order('created_at', { ascending: false })
      .range(from, to),
  );
  for (const r of rows) {
    if (!r.entity_id) continue;
    const info = (out[r.entity_id] ??= { memberAt: null, removed: false, accountAt: null });
    if (r.action === 'account.deactivate') {
      if (!info.accountAt || r.created_at > info.accountAt) info.accountAt = r.created_at;
    } else if (!info.memberAt || r.created_at > info.memberAt) {
      info.memberAt = r.created_at;
      info.removed = r.action === 'membership.remove';
    }
  }
  return out;
}

/* ── 로그인 안내 문자 수신자 (미리보기·발송 공용) ──────────────────────── */

/**
 * 로그인 안내 문자 치환 데이터 — 미리보기(서버 액션 → JSON)와 실제 발송이 같은 로더·같은 렌더 함수를 쓴다.
 * 매칭 정보는 이 행사의 **활성** mentor_assignments 기준, supportTypeId(범위)가 있으면 그 그룹만.
 * 이 행사 소속이 아닌 id 는 결과에서 빠진다(범위 강제). 발송 제외 사유는 `skip` 으로 표시.
 */
export async function loadLoginGuideRecipients(
  programId: string,
  supportTypeId: string | null,
  userIds: string[],
): Promise<{ program: { name: string; footer: string | null } | null; recipients: LoginGuideRecipient[] }> {
  const admin = createAdminClient();
  const ids = Array.from(new Set(userIds.filter((x) => typeof x === 'string' && x.length > 0)));
  const [{ data: program }, memberships, groups] = await Promise.all([
    admin.from('programs').select('name, sms_footer').eq('id', programId).maybeSingle(),
    fetchAllIn<{ user_id: string; role: string; is_active: boolean }>(ids, (chunk, from, to) => admin.from('program_members').select('user_id, role, is_active').eq('program_id', programId).in('user_id', chunk).range(from, to)),
    fetchAll<{ id: string; name: string }>((from, to) => admin.from('support_types').select('id, name').eq('program_id', programId).range(from, to)),
  ]);
  if (!program) return { program: null, recipients: [] };
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const memberOf = new Map(memberships.map((m) => [m.user_id, m]));
  const memberIds = ids.filter((id) => memberOf.has(id));
  if (memberIds.length === 0) return { program: { name: program.name, footer: program.sms_footer ?? null }, recipients: [] };
  const mentorIds = memberIds.filter((id) => memberOf.get(id)!.role === 'mentor');
  const menteeIds = memberIds.filter((id) => memberOf.get(id)!.role === 'mentee');
  const inScope = (stid: string | null | undefined) => !supportTypeId || stid === supportTypeId;

  type CaseLite = { id: string; mentee_id: string | null; owner_name: string; business_name: string; phone: string | null; support_type_id: string };
  const [users, mentorAssigns, menteeCases] = await Promise.all([
    fetchAllIn<{ id: string; name: string; email: string | null; phone: string | null; must_change_password: boolean; is_active: boolean; organization: string | null }>(memberIds, (chunk, from, to) =>
      admin.from('users').select('id, name, email, phone, must_change_password, is_active, organization').in('id', chunk).range(from, to),
    ),
    fetchAllIn<{ mentor_id: string; cases: CaseLite | null }>(mentorIds, (chunk, from, to) =>
      admin.from('mentor_assignments').select('mentor_id, cases!inner(id, mentee_id, owner_name, business_name, phone, support_type_id, program_id)').in('mentor_id', chunk).eq('is_active', true).eq('cases.program_id', programId).range(from, to),
    ),
    fetchAllIn<CaseLite & { created_at: string }>(menteeIds, (chunk, from, to) =>
      admin.from('cases').select('id, mentee_id, owner_name, business_name, phone, support_type_id, created_at').eq('program_id', programId).in('mentee_id', chunk).order('created_at', { ascending: false }).range(from, to),
    ),
  ]);
  const scopedMenteeCases = menteeCases.filter((c) => inScope(c.support_type_id));
  const menteeCaseIds = scopedMenteeCases.map((c) => c.id);
  const menteeAssigns = await fetchAllIn<{ case_id: string; mentor_id: string }>(menteeCaseIds, (chunk, from, to) =>
    admin.from('mentor_assignments').select('case_id, mentor_id').in('case_id', chunk).eq('is_active', true).range(from, to),
  );
  // 이름·휴대폰이 필요한 상대방 (멘토의 멘티 계정, 멘티의 멘토 계정)
  const otherIds = Array.from(
    new Set([
      ...mentorAssigns.map((a) => a.cases?.mentee_id).filter((x): x is string => !!x),
      ...menteeAssigns.map((a) => a.mentor_id),
    ]),
  );
  const others = await fetchAllIn<{ id: string; name: string; phone: string | null }>(otherIds, (chunk, from, to) => admin.from('users').select('id, name, phone').in('id', chunk).range(from, to));
  const otherById = new Map(others.map((o) => [o.id, o]));

  const menteesOf = new Map<string, { name: string; phone: string | null }[]>();
  const mentorGroups = new Map<string, Set<string>>();
  for (const a of mentorAssigns) {
    const c = a.cases;
    if (!c || !inScope(c.support_type_id)) continue;
    const u = c.mentee_id ? otherById.get(c.mentee_id) : undefined;
    const list = menteesOf.get(a.mentor_id) ?? [];
    list.push({ name: u?.name ?? c.owner_name, phone: u?.phone ?? c.phone ?? null });
    menteesOf.set(a.mentor_id, list);
    (mentorGroups.get(a.mentor_id) ?? mentorGroups.set(a.mentor_id, new Set()).get(a.mentor_id)!).add(c.support_type_id);
  }
  const mentorsOfCase = new Map<string, string[]>();
  for (const a of menteeAssigns) (mentorsOfCase.get(a.case_id) ?? mentorsOfCase.set(a.case_id, []).get(a.case_id)!).push(a.mentor_id);

  const byUser = new Map(users.map((u) => [u.id, u]));
  const recipients: LoginGuideRecipient[] = [];
  for (const id of memberIds) {
    const u = byUser.get(id);
    if (!u) continue;
    const mem = memberOf.get(id)!;
    const role = mem.role as UserRole;
    let organization = u.organization;
    let groupNames: string[] = [];
    let mentees: { name: string; phone: string | null }[] = [];
    const mentors: { name: string; phone: string | null }[] = [];
    if (role === 'mentor') {
      mentees = (menteesOf.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      groupNames = Array.from(mentorGroups.get(id) ?? []).map((g) => groupName.get(g) ?? '').filter(Boolean);
    } else if (role === 'mentee') {
      const cs = scopedMenteeCases.filter((c) => c.mentee_id === id);
      groupNames = Array.from(new Set(cs.map((c) => groupName.get(c.support_type_id) ?? '').filter(Boolean)));
      // 닉네임(business_name)이 이름과 같으면 소속 없음으로 본다 (P27 표시 규칙)
      if (!organization) organization = cs.map((c) => menteeOrg(c.owner_name, c.business_name)).find(Boolean) ?? null;
      const seen = new Set<string>();
      for (const c of cs) {
        for (const mid of mentorsOfCase.get(c.id) ?? []) {
          if (seen.has(mid)) continue;
          seen.add(mid);
          const m = otherById.get(mid);
          if (m) mentors.push({ name: m.name, phone: m.phone });
        }
      }
    }
    if (groupNames.length === 0 && supportTypeId && groupName.has(supportTypeId) && (role === 'mentor' || role === 'mentee')) groupNames = [groupName.get(supportTypeId)!];
    const skip: LoginGuideRecipient['skip'] = !mem.is_active ? 'inactive_member' : !u.is_active ? 'account_locked' : (normalizePhone(u.phone) ?? '').length < 10 ? 'no_phone' : null;
    recipients.push({
      id,
      name: u.name,
      role,
      email: u.email,
      phone: u.phone,
      mustChangePassword: u.must_change_password,
      organization,
      groupNames,
      mentees,
      mentors,
      skip,
    });
  }
  recipients.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return { program: { name: program.name, footer: program.sms_footer ?? null }, recipients };
}


/**
 * (P36-2) 비활성화 대신 강제 종료가 필요한 멘티 — 이 행사에서 진행 중 상태이고 보고서 등록 회차가 1건 이상인 케이스.
 * 반환: 멘티 id → 첫 번째 막는 케이스. 규칙은 `requiresForceEnd`(force-end-rule.ts) 하나 — 명단 버튼과 서버 게이트가 같이 쓴다.
 */
export async function loadForceEndBlocks(programId: string, userIds: string[]): Promise<Map<string, ForceEndBlock>> {
  const out = new Map<string, ForceEndBlock>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const admin = createAdminClient();
  const cases = await fetchAllIn<{ id: string; mentee_id: string | null; status: CaseStatus; support_types: { name: string } | null }>(ids, (chunk, from, to) =>
    admin
      .from('cases')
      .select('id, mentee_id, status, support_types(name)')
      .eq('program_id', programId)
      .in('mentee_id', chunk)
      .in('status', [...FORCE_END_REQUIRED_STATUSES])
      .range(from, to),
  );
  if (cases.length === 0) return out;
  const logs = await fetchAllIn<{ case_id: string }>(cases.map((c) => c.id), (chunk, from, to) =>
    admin.from('mentoring_logs').select('case_id').in('case_id', chunk).not('report_registered_at', 'is', null).range(from, to),
  );
  const reported = new Map<string, number>();
  for (const l of logs) reported.set(l.case_id, (reported.get(l.case_id) ?? 0) + 1);
  for (const c of cases) {
    if (!c.mentee_id || out.has(c.mentee_id)) continue;
    const n = reported.get(c.id) ?? 0;
    if (requiresForceEnd(c.status, n)) out.set(c.mentee_id, { caseId: c.id, reportedRounds: n, groupName: c.support_types?.name ?? null });
  }
  return out;
}
