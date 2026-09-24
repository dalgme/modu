'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { requireInstitution, requireNextlab } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { logAudit } from '@/lib/workflow/audit';

export type OperatorRequestResult = { ok: true } | { ok: false; error: string };

/**
 * 발주처: 운영사에게 보내는 요청 등록. 해당 케이스(멘티) 기준으로 제목·요청사항을 보낸다.
 * created_by 는 서버 세션에서 강제(위조 방지). program_id = 케이스의 행사 또는 현재 컨텍스트 (0080).
 */
export async function createOperatorRequestAction(input: {
  caseId?: string | null;
  title: string;
  body: string;
}): Promise<OperatorRequestResult> {
  const profile = await requireInstitution();
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false, error: '제목을 입력하세요.' };
  if (!body) return { ok: false, error: '요청사항을 입력하세요.' };
  if (title.length > 200) return { ok: false, error: '제목이 너무 깁니다. (200자 이내)' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  let programId = ctx.programId;
  if (input.caseId) {
    const { data: c } = await createAdminClient().from('cases').select('program_id').eq('id', input.caseId).maybeSingle();
    if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
    programId = c.program_id;
  }

  const supabase = createClient() as unknown as SupabaseClient;
  const { error } = await supabase.from('operator_requests').insert({
    case_id: input.caseId ?? null,
    title,
    body,
    created_by: profile.id,
    program_id: programId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/nextlab/dashboard');
  revalidatePath('/nextlab/board');
  return { ok: true };
}

/** 운영사 게이트 — review 권한 + 요청이 현재 행사 소속인지 */
async function operatorGate(id: string): Promise<{ ok: true; actorId: string; programId: string; row: { id: string; title: string; read_at: string | null; done_at: string | null; assigned_to: string | null } } | { ok: false; error: string }> {
  const profile = await requireNextlab();
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'review');
  if (denied) return { ok: false, error: denied };
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data } = await admin.from('operator_requests').select('id, title, read_at, done_at, assigned_to, program_id, case_id').eq('id', id).maybeSingle();
  if (!data) return { ok: false, error: '요청을 찾을 수 없습니다.' };
  let programId: string | null = data.program_id;
  if (!programId && data.case_id) {
    const { data: c } = await createAdminClient().from('cases').select('program_id').eq('id', data.case_id).maybeSingle();
    programId = c?.program_id ?? null;
  }
  if (programId && programId !== ctx.programId) return { ok: false, error: '이 행사의 요청이 아닙니다.' };
  return { ok: true, actorId: profile.id, programId: ctx.programId, row: data };
}

function revalidateOps() {
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/nextlab/board');
}

/** 운영사: 발주처 요청 읽음 처리 (강조 해제). */
export async function markOperatorRequestReadAction(id: string): Promise<OperatorRequestResult> {
  const g = await operatorGate(id);
  if (!g.ok) return g;
  if (g.row.read_at) return { ok: true };
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { error } = await admin
    .from('operator_requests')
    .update({ read_at: new Date().toISOString(), read_by: g.actorId, program_id: g.programId })
    .eq('id', id)
    .is('read_at', null);
  if (error) return { ok: false, error: error.message };
  await logAudit(createAdminClient(), { actorId: g.actorId, programId: g.programId, action: 'operator_request.read', entityType: 'operator_requests', entityId: id, metadata: { title: g.row.title } });
  revalidateOps();
  return { ok: true };
}

/** 운영사: [담당 지정(내가 맡기)] — assigned_to = 실행자. 이미 다른 담당자가 맡았으면 덮어쓰지 않는다(force 로 인계). */
export async function assignOperatorRequestAction(id: string, opts: { force?: boolean } = {}): Promise<OperatorRequestResult> {
  const g = await operatorGate(id);
  if (!g.ok) return g;
  if (g.row.done_at) return { ok: false, error: '이미 처리 완료된 요청입니다.' };
  if (g.row.assigned_to && g.row.assigned_to !== g.actorId && !opts.force) return { ok: false, error: '다른 담당자가 이미 맡은 요청입니다. 인계하려면 [담당 인계]를 사용하세요.' };
  const admin = createAdminClient() as unknown as SupabaseClient;
  let q = admin.from('operator_requests').update({ assigned_to: g.actorId, read_at: g.row.read_at ?? new Date().toISOString(), read_by: g.actorId, program_id: g.programId }).eq('id', id).is('done_at', null);
  if (!opts.force) q = g.row.assigned_to ? q.eq('assigned_to', g.row.assigned_to) : q.is('assigned_to', null);
  const { data, error } = await q.select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: '다른 담당자가 방금 이 요청을 맡았습니다. 새로고침하세요.' };
  await logAudit(createAdminClient(), { actorId: g.actorId, programId: g.programId, action: 'operator_request.assign', entityType: 'operator_requests', entityId: id, metadata: { title: g.row.title, previous_assignee: g.row.assigned_to, takeover: !!opts.force && !!g.row.assigned_to && g.row.assigned_to !== g.actorId } });
  revalidateOps();
  return { ok: true };
}

/** 운영사: [처리 완료] — done_at/done_by. 조건부 update 로 중복 완료 방지. */
export async function completeOperatorRequestAction(id: string): Promise<OperatorRequestResult> {
  const g = await operatorGate(id);
  if (!g.ok) return g;
  if (g.row.done_at) return { ok: false, error: '이미 처리 완료된 요청입니다.' };
  const admin = createAdminClient() as unknown as SupabaseClient;
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('operator_requests')
    .update({ done_at: now, done_by: g.actorId, read_at: g.row.read_at ?? now, read_by: g.actorId, assigned_to: g.row.assigned_to ?? g.actorId, program_id: g.programId })
    .eq('id', id)
    .is('done_at', null)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: '다른 담당자가 방금 처리 완료했습니다. 새로고침하세요.' };
  await logAudit(createAdminClient(), { actorId: g.actorId, programId: g.programId, action: 'operator_request.done', entityType: 'operator_requests', entityId: id, metadata: { title: g.row.title } });
  revalidateOps();
  return { ok: true };
}
