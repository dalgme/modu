'use server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { menteeLabel } from '@/lib/utils/labels';

export interface MentorPopupData {
  id: string;
  name: string;
  organization: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  mentorInstitution: string | null;
  expertise: string[];
  regions: string[];
  note: string | null;
  /** 이 행사(범위)에서 확정 배정된 멘티 수 */
  activeCount: number;
  designatedGroups: string[];
  mentees: {
    caseId: string;
    label: string;
    groupName: string | null;
    statusLabel: string;
    roundsDone: number;
    requiredRounds: number;
    assignedAt: string;
    confirmedAt: string | null;
  }[];
}

type Result = { ok: true; data: MentorPopupData } | { ok: false; error: string };

/** 멘토 이름 클릭 → 레이어 팝업 데이터 (P25-03). 발주처·운영사 전용, 이 행사 소속 멘토만. */
export async function getMentorPopupAction(mentorId: string): Promise<Result> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return { ok: false, error: '발주처·운영사 담당자만 볼 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const admin = createAdminClient();
  const [{ data: member }, { data: u }, { data: prof }, { data: roster }] = await Promise.all([
    admin.from('program_members').select('role').eq('program_id', ctx.programId).eq('user_id', mentorId).maybeSingle(),
    admin.from('users').select('id, name, organization, position, phone, email').eq('id', mentorId).maybeSingle(),
    admin.from('mentor_profiles').select('expertise, regions, mentor_institution, note').eq('program_id', ctx.programId).eq('user_id', mentorId).maybeSingle(),
    admin.from('support_type_members').select('support_type_id, support_types!inner(name, program_id)').eq('user_id', mentorId).eq('is_active', true).eq('support_types.program_id', ctx.programId),
  ]);
  if (!member || member.role !== 'mentor' || !u) return { ok: false, error: '이 행사의 멘토가 아닙니다.' };

  const { data: assigns } = await admin
    .from('mentor_assignments')
    .select('case_id, assigned_at, confirmed_at, cases!inner(id, owner_name, business_name, status, program_id, support_type_id, support_types(name, required_rounds))')
    .eq('mentor_id', mentorId)
    .eq('is_active', true)
    .eq('cases.program_id', ctx.programId)
    .order('assigned_at');
  const inScope = (assigns ?? []).filter((a) => {
    const c = a.cases as unknown as { support_type_id: string } | null;
    return !ctx.supportTypeId || c?.support_type_id === ctx.supportTypeId;
  });
  const caseIds = inScope.map((a) => a.case_id);
  const { data: logs } = caseIds.length ? await admin.from('mentoring_logs').select('case_id').in('case_id', caseIds).not('report_registered_at', 'is', null) : { data: [] as { case_id: string }[] };
  const rounds = new Map<string, number>();
  for (const l of logs ?? []) rounds.set(l.case_id, (rounds.get(l.case_id) ?? 0) + 1);

  return {
    ok: true,
    data: {
      id: u.id,
      name: u.name,
      organization: u.organization,
      position: u.position,
      phone: u.phone,
      email: u.email,
      mentorInstitution: prof?.mentor_institution ?? null,
      expertise: prof?.expertise ?? [],
      regions: prof?.regions ?? [],
      note: ctx.role === 'nextlab' ? (prof?.note ?? null) : null,
      activeCount: inScope.length,
      designatedGroups: (roster ?? []).map((r) => (r.support_types as unknown as { name: string } | null)?.name ?? '-'),
      mentees: inScope.map((a) => {
        const c = a.cases as unknown as { id: string; owner_name: string; business_name: string; status: CaseStatus; support_types: { name: string; required_rounds: number } | null };
        return {
          caseId: c.id,
          label: menteeLabel(c.owner_name, c.business_name),
          groupName: c.support_types?.name ?? null,
          statusLabel: CASE_STATUS_META[c.status]?.short ?? c.status,
          roundsDone: rounds.get(c.id) ?? 0,
          requiredRounds: c.support_types?.required_rounds ?? 0,
          assignedAt: a.assigned_at,
          confirmedAt: a.confirmed_at,
        };
      }),
    },
  };
}
