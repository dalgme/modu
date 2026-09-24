import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { resolveRoundReportPolicy } from '@/lib/documents/round-report';
import { estimateSettlements } from '@/lib/settlement/settle';
import { normalizeObservation } from '@/lib/workflow/closure';

/**
 * (P31) 운영사 검수 대기열 — closure_requested(검수 대기) / revision_requested(보완 요청 중) 케이스를
 * 오래된 순으로. 각 행에 대기일·회차·관찰의견서·서명(그룹 서명 정책이 켜진 경우만)·만족도·예상 실지급을 붙인다.
 * 예상 실지급은 settle.ts estimateSettlements(확정과 같은 computeSettlement) 합계.
 */
export interface ReviewQueueItem {
  caseId: string;
  ownerName: string;
  businessName: string;
  groupId: string;
  groupName: string;
  status: 'closure_requested' | 'revision_requested';
  mentorId: string | null;
  mentorName: string | null;
  /** 이 상태에 들어온 뒤 경과일 (case_status_history 기준, 없으면 updated_at) */
  waitingDays: number;
  enteredAt: string;
  reportedRounds: number;
  requiredRounds: number;
  hasObservation: boolean;
  /** 그룹 서명 정책이 켜진 경우만 {signed, total}, 아니면 null */
  signatures: { signed: number; total: number } | null;
  surveyAnswered: boolean;
  expectedNet: number;
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
    .select('id, owner_name, business_name, status, updated_at, support_type_id, support_types(name, required_rounds)')
    .eq('program_id', programId)
    .in('status', ['closure_requested', 'revision_requested']);
  if (groupId) q = q.eq('support_type_id', groupId);
  const { data: cases } = await q;
  const list = cases ?? [];
  if (list.length === 0) return { pending: [], revision: [] };
  const caseIds = list.map((c) => c.id);

  const [logs, history, { data: obs }, { data: obsFiles }, { data: responses }, { data: assigns }, { data: extra }, { data: reviews }] = await Promise.all([
    fetchAllIn<{ case_id: string; report_registered_at: string | null; mentee_signed_at: string | null }>(caseIds, (chunk, from, to) => admin.from('mentoring_logs').select('case_id, report_registered_at, mentee_signed_at').in('case_id', chunk).range(from, to)),
    fetchAllIn<{ case_id: string; to_status: string; created_at: string }>(caseIds, (chunk, from, to) => admin.from('case_status_history').select('case_id, to_status, created_at').in('case_id', chunk).in('to_status', ['closure_requested', 'revision_requested']).order('created_at', { ascending: false }).range(from, to)),
    admin.from('observation_reports').select('case_id, content').in('case_id', caseIds),
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
  const obsSummary = new Set((obs ?? []).filter((o) => normalizeObservation(o.content).summary.trim().length > 0).map((o) => o.case_id));
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
  const logsByCase = new Map<string, typeof logs>();
  for (const l of logs) logsByCase.set(l.case_id, [...(logsByCase.get(l.case_id) ?? []), l]);

  // 그룹별 서명 정책 (양식에 멘토 서명 컬럼이 있고 멘티 확인 서명이 켜진 그룹만 n/m 표시)
  const groupIds = Array.from(new Set(list.map((c) => c.support_type_id)));
  const signOn = new Map<string, boolean>();
  await Promise.all(groupIds.map(async (g) => signOn.set(g, (await resolveRoundReportPolicy(programId, g)).menteeConfirmSignature)));

  const items: ReviewQueueItem[] = [];
  for (const c of list) {
    const st = c.support_types as unknown as { name: string; required_rounds: number } | null;
    const rounds = logsByCase.get(c.id) ?? [];
    const reported = rounds.filter((r) => r.report_registered_at);
    const status = c.status as 'closure_requested' | 'revision_requested';
    const enteredAt = entered.get(`${c.id}:${status}`) ?? c.updated_at;
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
      requiredRounds: (st?.required_rounds ?? 0) + (extraOf.get(c.id) ?? 0),
      hasObservation: obsSummary.has(c.id) || obsFile.has(c.id),
      signatures: signOn.get(c.support_type_id) ? { signed: reported.filter((r) => r.mentee_signed_at).length, total: reported.length } : null,
      surveyAnswered: surveyed.has(c.id),
      expectedNet: est.reduce((s, e) => s + e.result.net, 0),
      revisionComment: status === 'revision_requested' ? (revisionComment.get(c.id) ?? null) : null,
    });
  }
  items.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
  return { pending: items.filter((i) => i.status === 'closure_requested'), revision: items.filter((i) => i.status === 'revision_requested') };
}
