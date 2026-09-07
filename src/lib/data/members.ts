import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
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
export async function listMentorsWithLoad(): Promise<MentorLoad[]> {
  const supabase = createClient();
  const [{ data: mentors }, { data: assigns }] = await Promise.all([
    supabase
      .from('users')
      .select('id, name, email, phone')
      .eq('role', 'mentor')
      .eq('is_active', true)
      .order('name'),
    supabase.from('mentor_assignments').select('mentor_id, case_id').eq('is_active', true),
  ]);

  // 멘토별 현재 활성 배정 케이스(중복 제외) 집계 — 회수·재배정된 과거 배정은 제외
  const casesByMentor = new Map<string, Set<string>>();
  for (const a of assigns ?? []) {
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
>;

/** 역할 표시 정렬 순서 (넥스트랩 → 진흥원 → 멘토 → 멘티) */
const ROLE_ORDER: Record<UserRole, number> = {
  nextlab: 0,
  institution: 1,
  mentor: 2,
  mentee: 3,
};

/**
 * 전 회원 목록 (넥스트랩 총괄관리자 전용).
 * service_role 로 조회 — 호출부(page)에서 requireNextlab 으로 권한 강제.
 */
export async function listMembers(): Promise<MemberRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select(
      'id, email, name, phone, role, is_active, must_change_password, invited_at, activated_at, created_at',
    )
    .order('created_at', { ascending: true });
  if (error || !data) return [];

  return [...data].sort((a, b) => {
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
 * 문자 발송 수신 대상 목록: 활성·휴대폰 보유 회원 (넥스트랩 전용 호출부 가드).
 * 역할순(넥스트랩→진흥원→멘토→멘티) 정렬. 멘티는 소속 기업명을 함께 반환.
 */
export async function listSmsRecipients(): Promise<SmsRecipient[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('id, name, phone, role, is_active')
    .eq('is_active', true)
    .not('phone', 'is', null);
  const rows = (data ?? []).filter((u) => (u.phone ?? '').replace(/\D/g, '').length >= 10);

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
