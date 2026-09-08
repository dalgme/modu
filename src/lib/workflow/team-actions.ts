'use server';

import { revalidatePath } from 'next/cache';

import { requireNextlab } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { toStoredPhone } from '@/lib/auth/identifier';

type ActionState = { ok: true; message: string } | { ok: false; error: string } | undefined;

/** 운영사 + 컨텍스트 행사 + case.manage 권한 + 케이스 행사 범위 검사. 통과 시 케이스 요약을 돌려준다 */
async function guardCase(caseId: string): Promise<{ ok: true; actorId: string; programId: string } | { ok: false; error: string }> {
  const actor = await requireNextlab();
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.manage');
  if (denied) return { ok: false, error: denied };
  const { data: c } = await createAdminClient().from('cases').select('id, program_id').eq('id', caseId).maybeSingle();
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  return { ok: true, actorId: actor.id, programId: ctx.programId };
}

function revalidate(caseId: string) {
  revalidatePath(`/nextlab/cases/${caseId}`);
  revalidatePath(`/mentor/cases/${caseId}`);
  revalidatePath(`/institution/cases/${caseId}`);
}

/** 아이템 정보 저장 — 아이템명(cases.item) + 아이템 설명(mentee_profiles.item_description) */
export async function saveTeamInfoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const caseId = String(formData.get('caseId') ?? '');
  const g = await guardCase(caseId);
  if (!g.ok) return g;
  const item = String(formData.get('item') ?? '').trim().slice(0, 120) || null;
  const itemDescription = String(formData.get('itemDescription') ?? '').trim().slice(0, 2000) || null;
  const admin = createAdminClient();
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    admin.from('cases').update({ item, updated_at: new Date().toISOString() }).eq('id', caseId),
    admin.from('mentee_profiles').upsert({ case_id: caseId, program_id: g.programId, item_description: itemDescription }, { onConflict: 'case_id' }),
  ]);
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)!.message };
  await admin.from('audit_logs').insert({ actor_id: g.actorId, program_id: g.programId, action: 'case.team_info', entity_type: 'cases', entity_id: caseId, metadata: { item } });
  revalidate(caseId);
  return { ok: true, message: '아이템 정보를 저장했습니다.' };
}

/** 팀원 추가/수정 — memberId 가 있으면 수정 */
export async function saveTeamMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const caseId = String(formData.get('caseId') ?? '');
  const g = await guardCase(caseId);
  if (!g.ok) return g;
  const memberId = String(formData.get('memberId') ?? '');
  const name = String(formData.get('name') ?? '').trim().slice(0, 40);
  const memberRole = String(formData.get('memberRole') ?? '').trim().slice(0, 40) || null;
  const phoneRaw = String(formData.get('phone') ?? '').trim();
  const phone = phoneRaw ? toStoredPhone(phoneRaw) ?? phoneRaw.slice(0, 20) : null;
  const email = String(formData.get('email') ?? '').trim().slice(0, 120) || null;
  const isRepresentative = String(formData.get('isRepresentative') ?? '') === 'true';
  if (!name) return { ok: false, error: '이름을 입력하세요.' };
  const admin = createAdminClient();
  const { count } = await admin.from('case_team_members').select('id', { count: 'exact', head: true }).eq('case_id', caseId);
  if (!memberId && (count ?? 0) >= 20) return { ok: false, error: '팀원은 최대 20명까지 등록할 수 있습니다.' };
  const { error } = memberId
    ? await admin.from('case_team_members').update({ name, member_role: memberRole, phone, email, is_representative: isRepresentative }).eq('id', memberId).eq('case_id', caseId)
    : await admin.from('case_team_members').insert({ case_id: caseId, program_id: g.programId, name, member_role: memberRole, phone, email, is_representative: isRepresentative, sort_order: (count ?? 0) + 1 });
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: g.actorId, program_id: g.programId, action: memberId ? 'case.team_member_update' : 'case.team_member_add', entity_type: 'cases', entity_id: caseId, metadata: { name } });
  revalidate(caseId);
  return { ok: true, message: memberId ? '팀원 정보를 수정했습니다.' : '팀원을 추가했습니다.' };
}

/** 팀원 삭제 — 회차 참가자 기록은 스냅샷이라 영향 없음 */
export async function deleteTeamMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const caseId = String(formData.get('caseId') ?? '');
  const memberId = String(formData.get('memberId') ?? '');
  const g = await guardCase(caseId);
  if (!g.ok) return g;
  if (!memberId) return { ok: false, error: '대상을 확인할 수 없습니다.' };
  const admin = createAdminClient();
  const { data: m } = await admin.from('case_team_members').select('name').eq('id', memberId).eq('case_id', caseId).maybeSingle();
  if (!m) return { ok: false, error: '팀원을 찾을 수 없습니다.' };
  const { error } = await admin.from('case_team_members').delete().eq('id', memberId);
  if (error) return { ok: false, error: error.message };
  await admin.from('audit_logs').insert({ actor_id: g.actorId, program_id: g.programId, action: 'case.team_member_delete', entity_type: 'cases', entity_id: caseId, metadata: { name: m.name } });
  revalidate(caseId);
  return { ok: true, message: '팀원을 삭제했습니다.' };
}
