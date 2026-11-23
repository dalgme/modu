import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { observationRequiredMap } from '@/lib/workflow/observation-required';
import { normalizeMentorRequestKind, type MentorRequestKind } from '@/lib/workflow/mentor-request-kind';

export type RequestKind = 'extension' | 'mentor_change' | 'mentor_withdrawal';

export interface InboxItem {
  id: string;
  kind: RequestKind;
  caseId: string;
  businessName: string;
  ownerName: string;
  supportTypeId: string;
  supportTypeName: string | null;
  caseStatus: string;
  requesterName: string;
  reason: string;
  extraRounds: number | null;
  /** 멘토 요청(mentor_withdrawal) 종류 — 멘토 변경(reassign) / 중도 종결(early_closure). 그 외 null (2026-11-17) */
  withdrawalKind: MentorRequestKind | null;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  /**
   * (2026-11-23) 멘토링 매칭이 끝나는 요청(멘토 변경·중도 종결)에 붙는 관찰의견서 첨부 여부 — 지금 시점의 케이스 관찰의견서 파일 기준.
   * attached 있음 / missing 없음 / not_required 관찰의견서를 내지 않는 라운드 / null 추가 회차 요청
   */
  observation: 'attached' | 'missing' | 'not_required' | null;
}

/** 요청함 — 행사 범위의 추가 회차·멘토 변경(멘티·멘토)·중도 종결 요청 (service_role + 코드 필터) */
export async function listInbox(programId: string, supportTypeId?: string, onlyPending = true): Promise<InboxItem[]> {
  const admin = createAdminClient();
  let casesQ = admin.from('cases').select('id, business_name, owner_name, support_type_id, status, support_types(name)').eq('program_id', programId);
  if (supportTypeId) casesQ = casesQ.eq('support_type_id', supportTypeId);
  const { data: cases } = await casesQ;
  const caseMap = new Map((cases ?? []).map((c) => [c.id, c]));
  const ids = Array.from(caseMap.keys());
  if (ids.length === 0) return [];
  const [{ data: ext }, { data: chg }, { data: wd }] = await Promise.all([
    admin.from('round_extension_requests').select('*').in('case_id', ids),
    admin.from('mentor_change_requests').select('*').in('case_id', ids),
    admin.from('mentor_withdrawal_requests').select('*').in('case_id', ids),
  ]);
  const userIds = Array.from(new Set([...(ext ?? []).map((r) => r.requested_by), ...(chg ?? []).map((r) => r.requested_by), ...(wd ?? []).map((r) => r.mentor_id)]));
  const { data: users } = userIds.length ? await admin.from('users').select('id, name').in('id', userIds) : { data: [] as { id: string; name: string }[] };
  const names = new Map((users ?? []).map((u) => [u.id, u.name]));
  // 매칭 종료 요청(멘토 변경·중도 종결)의 관찰의견서 첨부 여부
  const endCaseIds = Array.from(new Set([...(chg ?? []).map((r) => r.case_id), ...(wd ?? []).map((r) => r.case_id)]));
  const obsDocs = await fetchAllIn<{ case_id: string }>(endCaseIds, (chunk, from, to) => admin.from('documents').select('case_id').in('case_id', chunk).eq('doc_key', 'observation_report').range(from, to));
  const obsCases = new Set(obsDocs.map((d) => d.case_id));
  const obsReq = await observationRequiredMap(endCaseIds.map((id) => caseMap.get(id)?.support_type_id));
  const obsOf = (caseId: string): InboxItem['observation'] => {
    if (obsReq.get(caseMap.get(caseId)?.support_type_id ?? '') === false) return 'not_required';
    return obsCases.has(caseId) ? 'attached' : 'missing';
  };
  const base = (caseId: string) => {
    const c = caseMap.get(caseId)!;
    return { caseId, businessName: c.business_name, ownerName: c.owner_name, supportTypeId: c.support_type_id, supportTypeName: (c.support_types as unknown as { name: string } | null)?.name ?? null, caseStatus: c.status };
  };
  const items: InboxItem[] = [
    ...(ext ?? []).map((r) => ({ id: r.id, kind: 'extension' as const, ...base(r.case_id), requesterName: names.get(r.requested_by) ?? '-', reason: r.reason, extraRounds: r.extra_rounds, withdrawalKind: null, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at, decisionNote: r.decision_note, observation: null })),
    ...(chg ?? []).map((r) => ({ id: r.id, kind: 'mentor_change' as const, ...base(r.case_id), requesterName: names.get(r.requested_by) ?? '-', reason: r.reason, extraRounds: null, withdrawalKind: null, status: r.status, createdAt: r.created_at, decidedAt: r.handled_at, decisionNote: r.handling_note, observation: obsOf(r.case_id) })),
    ...(wd ?? []).map((r) => ({ id: r.id, kind: 'mentor_withdrawal' as const, ...base(r.case_id), requesterName: names.get(r.mentor_id) ?? '-', reason: r.reason, extraRounds: null, withdrawalKind: normalizeMentorRequestKind(r.kind), status: r.status, createdAt: r.created_at, decidedAt: r.decided_at, decisionNote: r.decision_note, observation: obsOf(r.case_id) })),
  ];
  return items.filter((i) => !onlyPending || i.status === 'pending').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function countPendingInbox(programId: string, supportTypeId?: string): Promise<number> {
  return (await listInbox(programId, supportTypeId, true)).length;
}
