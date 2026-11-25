import 'server-only';

import { observationRequiredMap } from '@/lib/workflow/observation-required';
import { closureRoundBase } from '@/lib/workflow/observation-rule';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { estimateSettlements } from '@/lib/settlement/settle';

/**
 * (P31) 운영사 검수 대기열 — closure_requested(검수 대기) / revision_requested(보완 요청 중) 케이스를
 * 오래된 순으로. 각 행에 대기일·회차·관찰의견서·만족도·예상 실지급을 붙인다.
 * 예상 실지급은 settle.ts estimateSettlements(확정과 같은 computeSettlement) 합계.
 */
export interface ReviewQueueItem {
  caseId: string;
  ownerName: string;
  businessName: string;
  groupId: string;
  groupName: string;
  /** ready = 종결 요청 전이지만 회차 보고서·관찰의견서가 모두 등록돼 바로 승인 가능한 진행 중 케이스 (2026-10-01) */
  status: 'closure_requested' | 'revision_requested' | 'ready';
  mentorId: string | null;
  mentorName: string | null;
  /** 이 상태에 들어온 뒤 경과일 (case_status_history 기준, 없으면 updated_at) */
  waitingDays: number;
  enteredAt: string;
  reportedRounds: number;
  requiredRounds: number;
  /** 멘토 중도 종결 요청이 승인돼 들어온 케이스 (2026-11-17) */
  earlyClosure: boolean;
  /** 승인된 추가 회차 (칩에 별도 표시, P32) */
  extraRounds: number;
  hasObservation: boolean;
  /** 그룹이 관찰의견서를 요구하는가 (2026-10-15) */
  observationRequired: boolean;
  surveyAnswered: boolean;
  expectedNet: number;
  /** (2026-11-18) 이 케이스에서 이미 확정된 정산(부분 정산 등) 실지급 합계·건수 — 예상액 0원이 '누락'으로 보이지 않게 */
  settledNet: number;
  settledCount: number;
  /** 보완 요청 사유 (revision_requested 일 때 최근 reviews.comment) */
  revisionComment: string | null;
}

export interface ReviewQueue {
  pending: ReviewQueueItem[];
  revision: ReviewQueueItem[];
}

const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

export async function listReviewQueue(programId: string, groupId: string | null): Promise<ReviewQueue> {
  const admin = createAdminClient();
  let q = admin
    .from('cases')
    .select('id, owner_name, business_name, status, updated_at, support_type_id, early_closure_at, support_types(name, required_rounds)')
    .eq('program_id', programId)
    .in('status', ['closure_requested', 'revision_requested', 'in_progress']);
  if (groupId) q = q.eq('support_type_id', groupId);
  const { data: cases } = await q;
  const list = cases ?? [];
  if (list.length === 0) return { pending: [], revision: [] };
  const caseIds = list.map((c) => c.id);

  const [logs, history, { data: obsFiles }, { data: responses }, { data: assigns }, { data: extra }, { data: reviews }] = await Promise.all([
    fetchAllIn<{ case_id: string; report_registered_at: string | null; settlement_id: string | null }>(caseIds, (chunk, from, to) => admin.from('mentoring_logs').select('case_id, report_registered_at, settlement_id').in('case_id', chunk).range(from, to)),
    fetchAllIn<{ case_id: string; to_status: string; created_at: string }>(caseIds, (chunk, from, to) => admin.from('case_status_history').select('case_id, to_status, created_at').in('case_id', chunk).in('to_status', ['closure_requested', 'revision_requested']).order('created_at', { ascending: false }).range(from, to)),
    admin.from('documents').select('case_id').in('case_id', caseIds).eq('doc_key', 'observation_report'),
    admin.from('survey_responses').select('case_id').in('case_id', caseIds),
    admin.from('mentor_assignments').select('case_id, mentor_id').in('case_id', caseIds).eq('is_active', true),
    admin.from('round_extension_requests').select('case_id, extra_rounds').in('case_id', caseIds).eq('status', 'approved'),
    admin.from('reviews').select('case_id, comment, created_at').in('case_id', caseIds).eq('result', 'revision_requested').order('created_at', { ascending: false }),
  ]);
  const mentorIds = Array.from(new Set((assigns ?? []).map((a) => a.mentor_id)));
  const { data: mentors } = mentorIds.length ? await admin.from('users').select('id, name').in('id', mentorIds) : { data: [] as { id: string; name: string }[] };
  const mentorName = new Map((mentors ?? []).map((m) => [m.id, m.name]));
  const mentorOf = new Map((assigns ?? []).map((a) => [a.case_id, a.mentor_id]));
  const obsFile = new Set((obsFiles ?? []).map((d) => d.case_id));
  const surveyed = new Set((responses ?? []).map((r) => r.case_id));
  const extraOf = new Map<string, number>();
  for (const e of extra ?? []) extraOf.set(e.case_id, (extraOf.get(e.case_id) ?? 0) + (e.extra_rounds ?? 0));
  const entered = new Map<string, string>();
  for (const h of history) {
    const key = `${h.case_id}:${h.to_status}`;
    if (!entered.has(key)) entered.set(key, h.created_at);
  }
  const revisionComment = new Map<string, string>();
  for (const r of reviews ?? []) if (!revisionComment.has(r.case_id) && r.comment) revisionComment.set(r.case_id, r.comment);
  // 이미 확정된 정산(취소 아님) — 멘토 변경·부분 정산으로 진행 회차가 먼저 정산된 케이스
  const settledRows = await fetchAllIn<{ case_id: string; net: number }>(caseIds, (chunk, from, to) =>
    admin.from('settlements').select('case_id, net').in('case_id', chunk).neq('status', 'canceled').range(from, to),
  );
  const settledByCase = new Map<string, number[]>();
  for (const r of settledRows) settledByCase.set(r.case_id, [...(settledByCase.get(r.case_id) ?? []), Number(r.net)]);
  const logsByCase = new Map<string, typeof logs>();
  for (const l of logs) logsByCase.set(l.case_id, [...(logsByCase.get(l.case_id) ?? []), l]);

  // 그룹별 관찰의견서 제출 여부
  const groupIds = Array.from(new Set(list.map((c) => c.support_type_id)));
  const obsRequired = await observationRequiredMap(groupIds);

  const items: ReviewQueueItem[] = [];
  for (const c of list) {
    const st = c.support_types as unknown as { name: string; required_rounds: number } | null;
    const rounds = logsByCase.get(c.id) ?? [];
    const reported = rounds.filter((r) => r.report_registered_at);
    // 진행 중 케이스는 승인 게이트(canApproveClosure)와 같은 조건 — 필수 회차 이상 · 전부 보고서 · 관찰의견서 파일 — 일 때만 'ready' 로 싣는다
    if (c.status === 'in_progress' && !(rounds.length >= (st?.required_rounds ?? 0) && (st?.required_rounds ?? 0) > 0 && reported.length === rounds.length && (obsFile.has(c.id) || obsRequired.get(c.support_type_id) === false))) continue;
    // (2026-11-25) 이미 정산된 회차뿐인 진행 중 케이스(라운드 연장으로 다시 연 케이스 등)는 새 보고서가 생길 때까지 '서류 완비'로 싣지 않는다 — 승인 게이트와 같은 규칙
    if (c.status === 'in_progress' && (settledByCase.get(c.id)?.length ?? 0) > 0 && !rounds.some((r) => r.report_registered_at && !r.settlement_id)) continue;
    const status = c.status === 'in_progress' ? 'ready' : (c.status as 'closure_requested' | 'revision_requested');
    const enteredAt = status === 'ready' ? c.updated_at : (entered.get(`${c.id}:${status}`) ?? c.updated_at);
    const est = await estimateSettlements(c.id);
    const mid = mentorOf.get(c.id) ?? null;
    items.push({
      caseId: c.id,
      ownerName: c.owner_name,
      businessName: c.business_name,
      groupId: c.support_type_id,
      groupName: st?.name ?? '-',
      status,
      mentorId: mid,
      mentorName: mid ? (mentorName.get(mid) ?? null) : null,
      waitingDays: daysSince(enteredAt),
      enteredAt,
      reportedRounds: reported.length,
      // 승인 게이트(canApproveClosure)와 같은 기준 — 추가 회차는 별도 (P32 리뷰 #9). 중도 종결 승인 케이스는 등록된 회차까지(2026-11-17)
      requiredRounds: closureRoundBase(!!c.early_closure_at, rounds.length, st?.required_rounds ?? 0),
      earlyClosure: !!c.early_closure_at,
      extraRounds: extraOf.get(c.id) ?? 0,
      hasObservation: obsFile.has(c.id),
      // (2026-11-23) 중도 종결도 관찰의견서 필수 — 면제 폐지, 그룹 설정만 따른다
      observationRequired: obsRequired.get(c.support_type_id) ?? true,
      surveyAnswered: surveyed.has(c.id),
      expectedNet: est.reduce((s, e) => s + e.result.net, 0),
      settledNet: (settledByCase.get(c.id) ?? []).reduce((s, x) => s + x, 0),
      settledCount: (settledByCase.get(c.id) ?? []).length,
      revisionComment: status === 'revision_requested' ? (revisionComment.get(c.id) ?? null) : null,
    });
  }
  items.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
  return { pending: items.filter((i) => i.status === 'closure_requested' || i.status === 'ready'), revision: items.filter((i) => i.status === 'revision_requested') };
}
