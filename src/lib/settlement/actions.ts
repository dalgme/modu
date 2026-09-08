'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';

import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { reviewClosure } from '@/lib/workflow/review';
import { cancelSettlement } from '@/lib/settlement/settle';
import { addToBatch, confirmBatch, createBatch, deleteDraftBatch, markBatchPaid, removeFromBatch, submitBatch, unsubmitBatch, type BatchResult } from '@/lib/workflow/batches';
import { decideMentorWithdrawal, forceEndMentor, withdrawCase } from '@/lib/workflow/withdrawal';
import { decideRoundExtension } from '@/lib/workflow/closure';
import type { WorkflowResult } from '@/lib/workflow/cases';

const OPERATOR_ONLY = '운영사 담당자만 실행할 수 있습니다.';
const CLIENT_ONLY = '발주처 담당자만 실행할 수 있습니다.';
const NO_CONTEXT = '행사를 먼저 선택하세요.';

function revalidateCase(caseId: string) {
  for (const p of ['/nextlab/dashboard', `/nextlab/cases/${caseId}`, '/nextlab/settlements', '/institution/dashboard', `/institution/cases/${caseId}`, '/institution/settlements', '/mentor/dashboard', `/mentor/cases/${caseId}`, '/mentor/settlements', '/mentee/dashboard']) {
    revalidatePath(p);
  }
}
function revalidateBatches(batchId?: string) {
  revalidatePath('/nextlab/settlements');
  revalidatePath('/institution/settlements');
  revalidatePath('/nextlab/dashboard');
  revalidatePath('/institution/dashboard');
  if (batchId) {
    revalidatePath(`/nextlab/settlements/batches/${batchId}`);
    revalidatePath(`/institution/settlements/${batchId}`);
  }
}

async function caseInProgram(caseId: string, programId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('cases').select('program_id').eq('id', caseId).maybeSingle();
  return !!data && data.program_id === programId;
}
async function batchInProgram(batchId: string, programId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('settlement_batches').select('program_id').eq('id', batchId).maybeSingle();
  return !!data && data.program_id === programId;
}

/** 운영사: T6 보완 요청 / T7 검수 승인(+정산 확정) */
export async function reviewClosureAction(caseId: string, result: 'approved' | 'revision_requested', comment: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'review'); if (denied) return { ok: false, error: denied }; }
  if (!(await caseInProgram(caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const r = await reviewClosure(caseId, profile.id, result, comment ?? '');
  if (r.ok) revalidateCase(caseId);
  return r;
}

/** 운영사: 정산 확정 취소 (pending · 품의 미편성) */
export async function cancelSettlementAction(settlementId: string, reason: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement'); if (denied) return { ok: false, error: denied }; }
  const { data: s } = await createAdminClient().from('settlements').select('program_id').eq('id', settlementId).maybeSingle();
  if (!s || s.program_id !== ctx.programId) return { ok: false, error: '이 행사의 정산 건이 아닙니다.' };
  const r = await cancelSettlement(settlementId, profile.id, reason ?? '');
  if (r.ok) {
    revalidateCase(r.caseId);
    revalidateBatches();
  }
  return r;
}

/** 운영사: 지급 품의 생성 (T8) */
export async function createBatchAction(title: string, settlementIds: string[], note?: string): Promise<BatchResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement'); if (denied) return { ok: false, error: denied }; }
  const r = await createBatch({ programId: ctx.programId, title, settlementIds, actorId: profile.id, note });
  if (r.ok) revalidateBatches(r.batchId);
  return r;
}

export async function addToBatchAction(batchId: string, settlementIds: string[]): Promise<BatchResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement'); if (denied) return { ok: false, error: denied }; }
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await addToBatch(batchId, settlementIds, profile.id);
  if (r.ok) revalidateBatches(batchId);
  return r;
}

export async function removeFromBatchAction(batchId: string, settlementId: string): Promise<BatchResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement'); if (denied) return { ok: false, error: denied }; }
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await removeFromBatch(batchId, settlementId, profile.id);
  if (r.ok) revalidateBatches(batchId);
  return r;
}

export async function deleteBatchAction(batchId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement'); if (denied) return { ok: false, error: denied }; }
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await deleteDraftBatch(batchId, profile.id);
  if (r.ok) revalidateBatches(batchId);
  return r;
}

export async function submitBatchAction(batchId: string): Promise<BatchResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement.submit'); if (denied) return { ok: false, error: denied }; }
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await submitBatch(batchId, profile.id);
  if (r.ok) revalidateBatches(batchId);
  return r;
}

export async function unsubmitBatchAction(batchId: string): Promise<BatchResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement.submit'); if (denied) return { ok: false, error: denied }; }
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await unsubmitBatch(batchId, profile.id);
  if (r.ok) revalidateBatches(batchId);
  return r;
}

/** 발주처: T9 정산 확인 (품의 단위) */
export async function confirmBatchAction(batchId: string): Promise<BatchResult> {
  const profile = await realRoleOrNull(['institution']);
  if (!profile) return { ok: false, error: CLIENT_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await confirmBatch(batchId, profile.id);
  if (r.ok) {
    revalidateBatches(batchId);
    const { data: items } = await createAdminClient().from('settlements').select('case_id').eq('batch_id', batchId);
    for (const s of items ?? []) revalidateCase(s.case_id);
  }
  return r;
}

/** 운영사: 지급 완료 표시 */
export async function markBatchPaidAction(batchId: string, paidAt?: string): Promise<BatchResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement.submit'); if (denied) return { ok: false, error: denied }; }
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await markBatchPaid(batchId, profile.id, paidAt);
  if (r.ok) revalidateBatches(batchId);
  return r;
}

/** 운영사·발주처: T10 멘티 중도 종료 (+부분 정산) */
export async function withdrawCaseAction(caseId: string, reason: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return { ok: false, error: '운영사·발주처 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  if (ctx.role === 'nextlab') { const denied = denyUnless(ctx, 'review'); if (denied) return { ok: false, error: denied }; }
  if (!(await caseInProgram(caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const r = await withdrawCase(caseId, profile.id, reason ?? '');
  if (r.ok) revalidateCase(caseId);
  return r;
}

/** 운영사: T11a 멘토 중도 종료 요청 승인/반려 */
export async function decideMentorWithdrawalAction(requestId: string, decision: 'approved' | 'rejected', note: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'review'); if (denied) return { ok: false, error: denied }; }
  const { data: req } = await createAdminClient().from('mentor_withdrawal_requests').select('case_id').eq('id', requestId).maybeSingle();
  if (!req || !(await caseInProgram(req.case_id, ctx.programId))) return { ok: false, error: '이 행사의 요청이 아닙니다.' };
  const r = await decideMentorWithdrawal(requestId, profile.id, decision, note ?? '');
  if (r.ok) revalidateCase(r.caseId);
  return r;
}

/** 운영사: T11b 멘토 강제 종료 */
export async function forceEndMentorAction(caseId: string, reason: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'review'); if (denied) return { ok: false, error: denied }; }
  if (!(await caseInProgram(caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const r = await forceEndMentor(caseId, profile.id, reason ?? '');
  if (r.ok) revalidateCase(caseId);
  return r;
}

/** 운영사: 추가 회차 요청 승인/반려 */
export async function decideExtensionAction(requestId: string, decision: 'approved' | 'rejected', note: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'review'); if (denied) return { ok: false, error: denied }; }
  const { data: req } = await createAdminClient().from('round_extension_requests').select('case_id').eq('id', requestId).maybeSingle();
  if (!req || !(await caseInProgram(req.case_id, ctx.programId))) return { ok: false, error: '이 행사의 요청이 아닙니다.' };
  const r = await decideRoundExtension(requestId, profile.id, decision, note ?? '');
  if (r.ok) {
    revalidateCase(r.caseId);
    revalidatePath('/nextlab/requests');
  }
  return r;
}
