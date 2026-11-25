'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/workflow/audit';
import { EXTENSION_REOPEN_STATUSES, extensionSelectBlock, extensionUsed, groupExtensionOf, hoursText, minutesOf } from '@/lib/workflow/extension-rule';

/**
 * 라운드 연장 선정·해제 (2026-11-25) — 회원 명단 > 멘티 [정보 수정] > 라운드 선택의 "1기 3라운드" 칩.
 *  선정: 케이스에 선정 표시. 검수 이후(종결 요청·정산 대기·품의·종결)라 멘토가 회차를 더 등록할 수 없는 케이스는 '진행 중'으로 다시 열고
 *        (종결 케이스는 끝까지 담당한 멘토 배정을 되살린다) 선정 전 단계를 기록해 둔다. 이미 확정된 정산·품의는 그대로 둔다.
 *  해제: 연장분(기본 회차 칸을 넘는 회차, 또는 상한−추가 시간을 넘는 시간)을 쓰지 않았을 때만. 다시 연 케이스는 정산 상태에 맞는 단계로 되돌린다.
 *  운영사 실제 신원 + case.manage, 컨텍스트 행사 케이스만. 감사 case.extension_select / case.extension_unselect.
 */
type Result = { ok: true; message: string } | { ok: false; error: string };

export async function setCaseExtensionAction(caseId: string, selected: boolean): Promise<Result> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.manage');
  if (denied) return { ok: false, error: denied };

  const admin = createAdminClient();
  const { data: row } = await admin.from('cases').select('*').eq('id', caseId).maybeSingle();
  const c = row as { id: string; program_id: string; support_type_id: string; status: string; owner_name: string; extension_selected_at?: string | null; extension_prev_status?: string | null } | null;
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const { data: g } = await admin.from('support_types').select('*').eq('id', c.support_type_id).maybeSingle();
  const group = groupExtensionOf(g as never);
  if (!group.label) return { ok: false, error: '이 라운드에는 연장 선정 기능이 없습니다.' };
  const label = group.label;
  const now = new Date().toISOString();

  if (selected) {
    if (c.extension_selected_at) return { ok: true, message: `이미 ${label} 선정자입니다.` };
    const block = extensionSelectBlock(c.status);
    if (block) return { ok: false, error: block };
    const reopen = EXTENSION_REOPEN_STATUSES.includes(c.status);
    const patch: Record<string, unknown> = { extension_selected_at: now, extension_selected_by: actor.id, extension_prev_status: c.status };
    if (reopen) {
      patch.status = 'in_progress';
      patch.closed_at = null;
    }
    const { data: upd, error } = await admin.from('cases').update(patch as never).eq('id', c.id).eq('status', c.status as never).select('id');
    if (error) return { ok: false, error: `선정 저장에 실패했습니다: ${error.message}` };
    if (!upd || upd.length === 0) return { ok: false, error: '그사이 케이스 단계가 바뀌었습니다. 다시 열어 주세요.' };
    let revived: string | null = null;
    if (reopen) {
      // 종결된 케이스 = 배정이 끝나 있다 — 끝까지 담당한 멘토 배정을 되살려 멘토가 추가 회차를 등록하게 한다
      const { data: active } = await admin.from('mentor_assignments').select('id').eq('case_id', c.id).eq('is_active', true).maybeSingle();
      if (!active) {
        const { data: last } = await admin.from('mentor_assignments').select('id, mentor_id').eq('case_id', c.id).eq('end_kind', 'case_closed').order('ended_at', { ascending: false }).limit(1).maybeSingle();
        if (last) {
          await admin.from('mentor_assignments').update({ is_active: true, ended_at: null, ended_by: null, end_kind: null } as never).eq('id', last.id);
          revived = last.mentor_id;
        }
      }
      await admin.from('case_status_history').insert({ case_id: c.id, from_status: c.status as never, to_status: 'in_progress', changed_by: actor.id, note: `${label} 선정 — 추가 멘토링을 위해 다시 진행 중으로` });
    }
    await logAudit(admin, {
      actorId: actor.id,
      programId: c.program_id,
      action: 'case.extension_select',
      entityType: 'cases',
      entityId: c.id,
      metadata: { case_id: c.id, label, from_status: c.status, reopened: reopen, revived_mentor_id: revived, extra_hours: group.extraHours, total_hours: group.totalHours },
    });
    revalidatePath('/nextlab/roster');
    return {
      ok: true,
      message: `${c.owner_name} — ${label} 선정. 멘토가 추가 ${group.extraHours}시간(총 ${group.totalHours ?? '-'}시간까지) 회차를 등록할 수 있습니다.${reopen ? ' 케이스를 진행 중으로 다시 열었습니다(기존 정산·품의는 그대로).' : ''}`,
    };
  }

  // 해제
  if (!c.extension_selected_at) return { ok: true, message: `${label} 선정자가 아닙니다.` };
  const [{ data: logs }, { data: ext }, { data: sets }] = await Promise.all([
    admin.from('mentoring_logs').select('id, started_at, ended_at, settlement_id').eq('case_id', c.id),
    admin.from('round_extension_requests').select('extra_rounds').eq('case_id', c.id).eq('status', 'approved'),
    admin.from('settlements').select('status').eq('case_id', c.id).neq('status', 'canceled'),
  ]);
  const rows = logs ?? [];
  const baseRounds = Number((g as { required_rounds?: number } | null)?.required_rounds ?? 0) + (ext ?? []).reduce((s, r) => s + Number(r.extra_rounds ?? 0), 0);
  const totalMinutes = rows.reduce((s, l) => s + minutesOf(l.started_at, l.ended_at), 0);
  if (extensionUsed({ roundCount: rows.length, baseRounds, totalMinutes, group })) {
    return { ok: false, error: `${label} 추가 회차가 이미 등록돼 있어 해제할 수 없습니다(지금 ${rows.length}회 · ${hoursText(totalMinutes)}). 추가 회차를 삭제한 뒤 해제하세요.` };
  }
  // 다시 연 케이스였고 정산 안 된 회차가 없으면 정산 상태에 맞는 단계로 되돌린다
  let back: string | null = null;
  const prev = c.extension_prev_status ?? null;
  // (진행 중으로 연 뒤 추가 회차 없이 종결 요청·보완 요청으로 간 경우도 같다 — 검수할 새 회차가 없어 그대로 두면 멈춘다)
  if (prev && EXTENSION_REOPEN_STATUSES.includes(prev) && ['in_progress', 'closure_requested', 'revision_requested'].includes(c.status) && rows.every((l) => l.settlement_id)) {
    const st = (sets ?? []).map((s) => s.status);
    if (st.length > 0 && st.every((s) => s === 'confirmed' || s === 'paid')) back = 'closed';
    else if (st.includes('batched')) back = 'settlement_batched';
    else if (st.includes('pending')) back = 'settlement_pending';
    else if (prev === 'closure_requested') back = 'closure_requested';
  }
  const patch: Record<string, unknown> = { extension_selected_at: null, extension_selected_by: null, extension_prev_status: null };
  if (back) {
    patch.status = back;
    if (back === 'closed') patch.closed_at = now;
  }
  const { data: upd, error } = await admin.from('cases').update(patch as never).eq('id', c.id).eq('status', c.status as never).select('id');
  if (error) return { ok: false, error: `해제 저장에 실패했습니다: ${error.message}` };
  if (!upd || upd.length === 0) return { ok: false, error: '그사이 케이스 단계가 바뀌었습니다. 다시 열어 주세요.' };
  if (back) {
    if (back === 'closed') await admin.from('mentor_assignments').update({ is_active: false, ended_at: now, ended_by: actor.id, end_kind: 'case_closed' } as never).eq('case_id', c.id).eq('is_active', true);
    await admin.from('case_status_history').insert({ case_id: c.id, from_status: c.status as never, to_status: back as never, changed_by: actor.id, note: `${label} 선정 해제 — 선정 전 단계로` });
  }
  await logAudit(admin, {
    actorId: actor.id,
    programId: c.program_id,
    action: 'case.extension_unselect',
    entityType: 'cases',
    entityId: c.id,
    metadata: { case_id: c.id, label, restored_status: back },
  });
  revalidatePath('/nextlab/roster');
  return { ok: true, message: `${c.owner_name} — ${label} 선정을 해제했습니다.${back ? ' 케이스를 선정 전 단계로 되돌렸습니다.' : ''}` };
}
