import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';
import type { UserRole } from '@/lib/auth/roles';
import { mentorEligibleForGroup } from '@/lib/matching/eligibility';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { listMentorDocStatus } from '@/lib/mentor-docs/data';
import { normalizePhone } from '@/lib/utils/phone';

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
