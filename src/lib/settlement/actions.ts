'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';

import { contextOrNull } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { createAdminClient } from '@/lib/supabase/admin';
import { reviewClosure, type ApprovalExpectation } from '@/lib/workflow/review';
import { cancelSettlement, resettlePartial, type CancelResult } from '@/lib/settlement/settle';
import { addToBatch, confirmBatch, createBatch, deleteDraftBatch, markBatchPaid, previewBatchSubmit, removeFromBatch, returnBatch, submitBatch, unsubmitBatch, updateBatchMeta, type BatchResult, type BatchSubmitPreview } from '@/lib/workflow/batches';
import { canWithdrawAs, INSTITUTION_WITHDRAW_DENIED } from '@/lib/workflow/transitions';
import { decideMentorWithdrawal, forceEndMentor, withdrawCase } from '@/lib/workflow/withdrawal';
import { decideRoundExtension, notifyProgramStaff } from '@/lib/workflow/closure';
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

/** 운영사: T6 보완 요청 / T7 검수 승인(+정산 확정). expected = 화면이 본 예상 실지급·회차 id (서버 재계산과 다르면 거부, P31) */
export async function reviewClosureAction(caseId: string, result: 'approved' | 'revision_requested', comment: string, expected?: ApprovalExpectation | null): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'review'); if (denied) return { ok: false, error: denied }; }
  if (!(await caseInProgram(caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const r = await reviewClosure(caseId, profile.id, result, comment ?? '', expected ?? null);
  if (r.ok) {
    revalidateCase(caseId);
    revalidatePath('/nextlab/review');
  }
  return r;
}

/** 운영사: 정산 확정 취소 (pending · 품의 미편성). 반환에 kind·caseReverted 를 실어 화면 문구를 종류별로 (P31) */
export async function cancelSettlementAction(settlementId: string, reason: string): Promise<CancelResult> {
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

/** (P31) 운영사: 취소된 부분 정산 재확정 — 종료된 멘토의 미정산 이행 회차를 partial 로 다시 스냅샷 */
export async function resettlePartialAction(caseId: string, mentorId: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement'); if (denied) return { ok: false, error: denied }; }
  if (!(await caseInProgram(caseId, ctx.programId))) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  const r = await resettlePartial(caseId, mentorId, profile.id);
  if (!r.ok) return r;
  revalidateCase(caseId);
  revalidateBatches();
  return { ok: true, caseId };
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

/** (P31) 운영사: draft 품의 제목·메모 수정 */
export async function updateBatchMetaAction(batchId: string, title: string, note?: string | null): Promise<BatchResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement'); if (denied) return { ok: false, error: denied }; }
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await updateBatchMeta(batchId, profile.id, { title, note });
  if (r.ok) revalidateBatches(batchId);
  return r;
}

/** (P31) 운영사: 제출 전 미리보기 — 품의 단위 과세최저한 재계산 대상·합계 변화 */
export async function previewBatchSubmitAction(batchId: string): Promise<BatchSubmitPreview | { ok: false; error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement.submit'); if (denied) return { ok: false, error: denied }; }
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  return previewBatchSubmit(batchId);
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

/** (P31) 발주처: 품의 반려 (submitted → draft) — 사유 필수, 운영사 담당자에게 알림 */
export async function returnBatchAction(batchId: string, reason: string): Promise<BatchResult> {
  const profile = await realRoleOrNull(['institution']);
  if (!profile) return { ok: false, error: CLIENT_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await returnBatch(batchId, profile.id, reason ?? '');
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

/** 운영사: 지급 완료 표시. paidOn = KST 날짜(YYYY-MM-DD, 기본 오늘, 미래 불가 — 서버 검증) */
export async function markBatchPaidAction(batchId: string, paidOn?: string): Promise<BatchResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: OPERATOR_ONLY };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  { const denied = denyUnless(ctx, 'settlement.submit'); if (denied) return { ok: false, error: denied }; }
  if (!(await batchInProgram(batchId, ctx.programId))) return { ok: false, error: '이 행사의 품의가 아닙니다.' };
  const r = await markBatchPaid(batchId, profile.id, paidOn);
  if (r.ok) {
    revalidateBatches(batchId);
    revalidatePath('/mentor/settlements');
  }
  return r;
}

/** 운영사·발주처: T10 멘티 중도 종료 (+부분 정산) */
export async function withdrawCaseAction(caseId: string, reason: string): Promise<WorkflowResult> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return { ok: false, error: '운영사·발주처 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: NO_CONTEXT };
  if (ctx.role === 'nextlab') { const denied = denyUnless(ctx, 'review'); if (denied) return { ok: false, error: denied }; }
  const admin = createAdminClient();
  const { data: c } = await admin.from('cases').select('program_id, status').eq('id', caseId).maybeSingle();
  if (!c || c.program_id !== ctx.programId) return { ok: false, error: '이 행사의 케이스가 아닙니다.' };
  // (P31) 발주처는 운영사 검수 중(종결·보완 요청) 케이스를 중도 종료할 수 없다 — 화면 버튼과 같은 canWithdrawAs
  if (!canWithdrawAs(ctx.role, c.status)) return { ok: false, error: ctx.role === 'institution' ? fmt(INSTITUTION_WITHDRAW_DENIED, ctx.branding) : '이미 종결(또는 정산 확정)된 케이스는 중도 종료할 수 없습니다.' };
  const r = await withdrawCase(caseId, profile.id, reason ?? '');
  if (r.ok) {
    revalidateCase(caseId);
    // (P31) 발주처가 중도 종료하면 운영사 담당자에게 통보
    if (ctx.role === 'institution') {
      try {
        await notifyProgramStaff(ctx.programId, caseId, 'case_withdrawn', ['nextlab']);
      } catch (err) {
        console.error('withdraw notify staff failed:', err);
      }
    }
  }
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
