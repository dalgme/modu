import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

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
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

/** 요청함 — 행사 범위의 추가 회차·멘토 변경·중도 종료 요청 (service_role + 코드 필터) */
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
  const base = (caseId: string) => {
    const c = caseMap.get(caseId)!;
    return { caseId, businessName: c.business_name, ownerName: c.owner_name, supportTypeId: c.support_type_id, supportTypeName: (c.support_types as unknown as { name: string } | null)?.name ?? null, caseStatus: c.status };
  };
  const items: InboxItem[] = [
    ...(ext ?? []).map((r) => ({ id: r.id, kind: 'extension' as const, ...base(r.case_id), requesterName: names.get(r.requested_by) ?? '-', reason: r.reason, extraRounds: r.extra_rounds, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at, decisionNote: r.decision_note })),
    ...(chg ?? []).map((r) => ({ id: r.id, kind: 'mentor_change' as const, ...base(r.case_id), requesterName: names.get(r.requested_by) ?? '-', reason: r.reason, extraRounds: null, status: r.status, createdAt: r.created_at, decidedAt: r.handled_at, decisionNote: r.handling_note })),
    ...(wd ?? []).map((r) => ({ id: r.id, kind: 'mentor_withdrawal' as const, ...base(r.case_id), requesterName: names.get(r.mentor_id) ?? '-', reason: r.reason, extraRounds: null, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at, decisionNote: r.decision_note })),
  ];
  return items.filter((i) => !onlyPending || i.status === 'pending').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function countPendingInbox(programId: string, supportTypeId?: string): Promise<number> {
  return (await listInbox(programId, supportTypeId, true)).length;
}
