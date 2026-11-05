'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import { createCase } from '@/lib/workflow/cases';
import { menteeLabel } from '@/lib/utils/labels';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { menteeRoundAddBlock, menteeRoundRemovalBlock, type MenteeRoundCaseFacts } from '@/lib/workflow/mentee-round-rule';

/**
 * 멘티 라운드 선택 (2026-11-05) — 회원 명단 > 멘티 [정보 수정]의 라운드 칩.
 * 켜기 = 그 라운드에 케이스 추가(멘티 정보 복사), 끄기 = 진행 기록 없는 케이스만 삭제(실수 등록 정리).
 * 규칙은 mentee-round-rule.ts 한 곳(화면 버튼과 같은 함수). 운영사 실제 신원 + case.manage, 컨텍스트 행사만.
 */

export interface MenteeRoundItem {
  groupId: string;
  groupName: string;
  groupActive: boolean;
  /** 이 라운드의 케이스 (중도 종료 포함 최신 1건), 없으면 null */
  caseId: string | null;
  statusLabel: string | null;
  mentorName: string | null;
  /** 켜져 있으면 빼기 막힘 사유, 꺼져 있으면 추가 막힘 사유 */
  block: string | null;
  /** 켜짐 = 진행 중(중도 종료 아님) 케이스가 있음 */
  on: boolean;
}

type Loaded = { ok: true; rounds: MenteeRoundItem[]; name: string } | { ok: false; error: string };
type Result = { ok: true; message: string } | { ok: false; error: string };

async function operatorCtx(): Promise<{ id: string; programId: string } | { error: string }> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.manage');
  if (denied) return { error: denied };
  return { id: actor.id, programId: ctx.programId };
}

async function menteeInProgram(programId: string, userId: string): Promise<{ name: string } | null> {
  const admin = createAdminClient();
  const [{ data: m }, { data: u }] = await Promise.all([
    admin.from('program_members').select('role').eq('program_id', programId).eq('user_id', userId).maybeSingle(),
    admin.from('users').select('name').eq('id', userId).maybeSingle(),
  ]);
  if (!m || m.role !== 'mentee' || !u) return null;
  return { name: u.name };
}

async function caseFacts(caseIds: string[]): Promise<Map<string, Omit<MenteeRoundCaseFacts, 'status'>>> {
  const admin = createAdminClient();
  const out = new Map<string, Omit<MenteeRoundCaseFacts, 'status'>>();
  for (const id of caseIds) out.set(id, { logs: 0, settlements: 0, documents: 0, surveyResponses: 0, successors: 0 });
  if (caseIds.length === 0) return out;
  const [logs, settlements, docs, responses, successors] = await Promise.all([
    admin.from('mentoring_logs').select('case_id').in('case_id', caseIds),
    admin.from('settlements').select('case_id').in('case_id', caseIds),
    admin.from('documents').select('case_id').in('case_id', caseIds),
    admin.from('survey_responses').select('case_id').in('case_id', caseIds),
    admin.from('cases').select('predecessor_case_id').in('predecessor_case_id', caseIds),
  ]);
  const bump = (rows: { case_id?: string | null; predecessor_case_id?: string | null }[] | null, key: keyof Omit<MenteeRoundCaseFacts, 'status'>, col: 'case_id' | 'predecessor_case_id') => {
    for (const r of rows ?? []) {
      const id = r[col];
      const f = id ? out.get(id) : undefined;
      if (f) f[key] += 1;
    }
  };
  bump(logs.data, 'logs', 'case_id');
  bump(settlements.data, 'settlements', 'case_id');
  bump(docs.data, 'documents', 'case_id');
  bump(responses.data, 'surveyResponses', 'case_id');
  bump(successors.data as { predecessor_case_id: string | null }[] | null, 'successors', 'predecessor_case_id');
  for (const e of [logs.error, settlements.error, docs.error, responses.error, successors.error]) if (e) console.error('mentee round facts failed:', e.message);
  return out;
}

/** 정보 수정 패널이 열릴 때 불러오는 라운드 목록 (행사 전체 라운드 — 범위 스위처와 무관) */
export async function getMenteeRoundsAction(userId: string): Promise<Loaded> {
  const op = await operatorCtx();
  if ('error' in op) return { ok: false, error: op.error };
  const who = await menteeInProgram(op.programId, userId);
  if (!who) return { ok: false, error: '이 행사의 멘티가 아닙니다.' };
  const admin = createAdminClient();
  const [{ data: groups }, { data: cases }] = await Promise.all([
    admin.from('support_types').select('id, name, status, sort_order').eq('program_id', op.programId).order('sort_order').order('created_at'),
    admin.from('cases').select('id, support_type_id, status, created_at').eq('program_id', op.programId).eq('mentee_id', userId).order('created_at', { ascending: false }),
  ]);
  const caseIds = (cases ?? []).map((c) => c.id);
  const [facts, { data: asg }] = await Promise.all([
    caseFacts(caseIds),
    caseIds.length ? admin.from('mentor_assignments').select('case_id, mentor_id').in('case_id', caseIds).eq('is_active', true) : Promise.resolve({ data: [] as { case_id: string; mentor_id: string }[] }),
  ]);
  const mentorIds = Array.from(new Set((asg ?? []).map((a) => a.mentor_id)));
  const { data: mentors } = mentorIds.length ? await admin.from('users').select('id, name').in('id', mentorIds) : { data: [] as { id: string; name: string }[] };
  const mentorName = new Map((mentors ?? []).map((m) => [m.id, m.name]));
  const mentorOfCase = new Map((asg ?? []).map((a) => [a.case_id, mentorName.get(a.mentor_id) ?? null]));

  const rounds: MenteeRoundItem[] = (groups ?? []).map((g) => {
    const mine = (cases ?? []).filter((c) => c.support_type_id === g.id);
    const open = mine.find((c) => c.status !== 'withdrawn') ?? null;
    const shown = open ?? mine[0] ?? null;
    const block = open
      ? menteeRoundRemovalBlock({ status: open.status, ...facts.get(open.id)! })
      : menteeRoundAddBlock({ status: g.status, hasOpenCase: false });
    return {
      groupId: g.id,
      groupName: g.name,
      groupActive: g.status === 'active',
      caseId: shown?.id ?? null,
      statusLabel: shown ? (shown.status === 'withdrawn' ? '중도 종료' : CASE_STATUS_META[shown.status as CaseStatus]?.short ?? shown.status) : null,
      mentorName: shown ? mentorOfCase.get(shown.id) ?? null : null,
      block,
      on: !!open,
    };
  });
  return { ok: true, rounds, name: who.name };
}

/** 라운드 추가 — 이 멘티의 가장 최근 케이스에서 멘티 정보(이름·닉네임·연락처·아이템·프로필)를 복사해 새 케이스 */
export async function addMenteeRoundAction(userId: string, groupId: string): Promise<Result> {
  const op = await operatorCtx();
  if ('error' in op) return { ok: false, error: op.error };
  const who = await menteeInProgram(op.programId, userId);
  if (!who) return { ok: false, error: '이 행사의 멘티가 아닙니다.' };
  const admin = createAdminClient();
  const { data: g } = await admin.from('support_types').select('id, name, status').eq('id', groupId).eq('program_id', op.programId).maybeSingle();
  if (!g) return { ok: false, error: '이 행사의 라운드가 아닙니다.' };
  const { data: mine } = await admin.from('cases').select('*').eq('program_id', op.programId).eq('mentee_id', userId).order('created_at', { ascending: false });
  const hasOpen = (mine ?? []).some((c) => c.support_type_id === g.id && c.status !== 'withdrawn');
  const block = menteeRoundAddBlock({ status: g.status, hasOpenCase: hasOpen });
  if (block) return { ok: false, error: block };

  const src = (mine ?? [])[0] ?? null;
  const { data: user } = await admin.from('users').select('name, email, phone').eq('id', userId).maybeSingle();
  const created = await createCase({
    programId: op.programId,
    createdBy: op.id,
    support_type_id: g.id,
    menteeId: userId,
    owner_name: src?.owner_name ?? user?.name ?? who.name,
    business_name: src?.business_name ?? src?.owner_name ?? user?.name ?? who.name,
    phone: src?.phone ?? user?.phone ?? '',
    email: src?.email ?? user?.email ?? null,
    item: src?.item ?? null,
    address: src?.address ?? null,
    business_type: src?.business_type ?? null,
    business_reg_no: src?.business_reg_no ?? null,
    opened_at: src?.opened_at ?? null,
    employee_count: src?.employee_count ?? null,
  } as Parameters<typeof createCase>[0]);
  if (!created.ok) return created;

  // 멘티 프로필(희망분야·유형·고유번호 등) 복사 — 순위·희망 멘토는 라운드별 값이라 비운다 (승계 개설과 같은 규칙)
  if (src) {
    const { data: prof } = await admin.from('mentee_profiles').select('*').eq('case_id', src.id).maybeSingle();
    if (prof) {
      const { case_id: _c, created_at: _cr, updated_at: _u, ...rest } = prof;
      void _c; void _cr; void _u;
      const { error } = await admin.from('mentee_profiles').upsert({ ...rest, case_id: created.caseId, rank: null, preferred_mentor: null }, { onConflict: 'case_id' });
      if (error) console.error('mentee round profile copy failed:', error.message);
    }
  }
  // 매칭 추천만 다시 계산(자동 배정은 하지 않음) — 실패해도 추가는 유지
  try {
    const { rebuildAutoRecommendations } = await import('@/lib/matching/auto-match');
    await rebuildAutoRecommendations(created.caseId, op.id);
  } catch (e) {
    console.error('mentee round recommendations failed:', e instanceof Error ? e.message : e);
  }
  await logAudit(admin, { actorId: op.id, programId: op.programId, action: 'mentee.round_add', entityType: 'cases', entityId: created.caseId, metadata: { case_id: created.caseId, mentee_id: userId, support_type_id: g.id, group_name: g.name, copied_from_case_id: src?.id ?? null } });
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/dashboard');
  return { ok: true, message: `${who.name} 멘티를 ${g.name}에 추가했습니다. 매칭 리스트에서 멘토를 배정하세요.` };
}

/** 라운드에서 빼기 — 진행 기록이 없는 케이스만 삭제 (멘토 배정·추천·프로필은 케이스와 함께 정리) */
export async function removeMenteeRoundAction(userId: string, caseId: string): Promise<Result> {
  const op = await operatorCtx();
  if ('error' in op) return { ok: false, error: op.error };
  const who = await menteeInProgram(op.programId, userId);
  if (!who) return { ok: false, error: '이 행사의 멘티가 아닙니다.' };
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('*').eq('id', caseId).maybeSingle();
  if (!c || c.program_id !== op.programId || c.mentee_id !== userId) return { ok: false, error: '이 멘티의 케이스가 아닙니다.' };
  const facts = (await caseFacts([c.id])).get(c.id)!;
  const block = menteeRoundRemovalBlock({ status: c.status, ...facts });
  if (block) return { ok: false, error: block };

  const [{ data: group }, { data: asg }, { data: prof }] = await Promise.all([
    admin.from('support_types').select('name').eq('id', c.support_type_id).maybeSingle(),
    admin.from('mentor_assignments').select('mentor_id, is_active, assigned_at').eq('case_id', c.id),
    admin.from('mentee_profiles').select('*').eq('case_id', c.id).maybeSingle(),
  ]);
  // 삭제 전에 감사 로그에 케이스·배정·프로필 스냅샷을 남긴다 (감사 로그는 지우지 않으므로 필요하면 이 기록으로 다시 만들 수 있다)
  await logAudit(admin, {
    actorId: op.id,
    programId: op.programId,
    action: 'mentee.round_remove',
    entityType: 'cases',
    entityId: c.id,
    metadata: { case_id: c.id, mentee_id: userId, mentee_name: menteeLabel(c.owner_name ?? '', c.business_name), support_type_id: c.support_type_id, group_name: group?.name ?? null, status: c.status, snapshot: { case: c, assignments: asg ?? [], profile: prof ?? null } },
  });
  const { error } = await admin.from('cases').delete().eq('id', c.id);
  if (error) return { ok: false, error: `라운드에서 빼지 못했습니다: ${error.message}` };
  revalidatePath('/nextlab/roster');
  revalidatePath('/nextlab/dashboard');
  return { ok: true, message: `${who.name} 멘티를 ${group?.name ?? '라운드'}에서 뺐습니다.` };
}
