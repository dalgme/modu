import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';
import type { UserRole } from '@/lib/auth/roles';

export interface MentorLoad {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** 현재까지 배정받은 멘티(케이스) 수 — 중복 케이스 제외 */
  menteeCount: number;
}

/**
 * 멘토 현황: 멘토별 이름·이메일·연락처 + 배정받은 멘티(케이스) 수.
 * (운영진 열람 — RLS 로 접근 제어) 활성 멘토만, 이름순.
 */
export async function listMentorsWithLoad(programId: string): Promise<MentorLoad[]> {
  const admin = createAdminClient();
  // 이 행사에서 역할이 멘토인 소속 (설계 B: program_members.role)
  const { data: members } = await admin.from('program_members').select('user_id').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const [{ data: mentors }, { data: assigns }] = await Promise.all([
    admin.from('users').select('id, name, email, phone').in('id', ids).eq('is_active', true).order('name'),
    admin.from('mentor_assignments').select('mentor_id, case_id, cases!inner(program_id)').in('mentor_id', ids).eq('is_active', true),
  ]);

  // 멘토별 이 행사 케이스의 활성 배정(중복 제외) 집계
  const casesByMentor = new Map<string, Set<string>>();
  for (const a of assigns ?? []) {
    if ((a.cases as unknown as { program_id: string } | null)?.program_id !== programId) continue;
    if (!casesByMentor.has(a.mentor_id)) casesByMentor.set(a.mentor_id, new Set());
    casesByMentor.get(a.mentor_id)!.add(a.case_id);
  }

  return (mentors ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    menteeCount: casesByMentor.get(m.id)?.size ?? 0,
  }));
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
};

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
export async function listProgramMembers(programId: string): Promise<MemberRow[]> {
  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from('program_members')
    .select('user_id, role, is_active, joined_at, grade, duty')
    .eq('program_id', programId)
    .order('joined_at', { ascending: true });
  const ids = (memberships ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: users } = await admin
    .from('users')
    .select('id, email, name, phone, role, is_active, must_change_password, invited_at, activated_at, created_at, position')
    .in('id', ids);
  const byId = new Map((users ?? []).map((u) => [u.id, u]));
  const rows: MemberRow[] = [];
  for (const m of memberships ?? []) {
    const u = byId.get(m.user_id);
    if (!u) continue;
    rows.push({ ...u, primaryRole: u.role, role: m.role as UserRole, memberActive: m.is_active, joinedAt: m.joined_at, position: u.position, grade: m.grade, duty: m.duty });
  }
  return rows.sort((a, b) => {
    const r = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    return r !== 0 ? r : a.created_at.localeCompare(b.created_at);
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
export async function listSmsRecipients(programId: string): Promise<SmsRecipient[]> {
  const admin = createAdminClient();
  // 이 행사 소속만, 역할은 행사 안 역할 (설계 B)
  const { data: memberships } = await admin.from('program_members').select('user_id, role').eq('program_id', programId).eq('is_active', true);
  const roleOf = new Map((memberships ?? []).map((m) => [m.user_id, m.role as UserRole]));
  const ids = Array.from(roleOf.keys());
  const { data } = ids.length
    ? await admin.from('users').select('id, name, phone, is_active').in('id', ids).eq('is_active', true).not('phone', 'is', null)
    : { data: [] as { id: string; name: string; phone: string | null; is_active: boolean }[] };
  const rows = (data ?? [])
    .filter((u) => (u.phone ?? '').replace(/\D/g, '').length >= 10)
    .map((u) => ({ ...u, role: roleOf.get(u.id)! }));

  // 멘티 소속 기업명 매핑 (mentee_id → business_name)
  const menteeIds = rows.filter((u) => u.role === 'mentee').map((u) => u.id);
  const businessByMentee = new Map<string, string>();
  if (menteeIds.length) {
    const { data: cases } = await admin
      .from('cases')
      .select('mentee_id, business_name, created_at')
      .in('mentee_id', menteeIds)
      .order('created_at', { ascending: false });
    for (const c of cases ?? []) {
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
