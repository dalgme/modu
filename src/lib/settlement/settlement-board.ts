import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { listCases } from '@/lib/data/cases';
import { loadInactiveMemberIds } from '@/lib/data/inactive-members';
import { menteeLabel } from '@/lib/utils/labels';
import { mentoringOutcomeLabel } from '@/lib/workflow/mentoring-outcome';
import { pastMentorLabel } from '@/lib/workflow/past-mentor';
import type { CaseStatus } from '@/types/case-status';

/**
 * (2026-11-16) 운영사 [정산·품의] 화면 — 지급 품의 목록 보조 수치 + "아직 검수·정산에 안 들어온 멘티" 목록.
 * 금액 계산은 하지 않는다(정산 금액은 settlements 스냅샷, 예상 수당은 회차 금액 스냅샷 합계).
 */

const minutesOf = (l: { started_at: string; ended_at: string }) => Math.max(0, Math.round((new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 60000));

export interface BatchListExtras {
  /** 품의별 멘토링 진행 시간(분) — 품의에 든 정산의 회차 합계 */
  minutesByBatch: Map<string, number>;
  /** 품의별 멘티 id(없으면 케이스 id) */
  menteesByBatch: Map<string, string[]>;
  /** 목록에 든 멘티 수(중복 제외) */
  listedMentees: number;
  /** 범위 안 전체 멘티 수(중복 제외) — 비활성 멘티는 목록에 든 경우만 */
  totalMentees: number;
}

export async function loadBatchListExtras(programId: string, supportTypeId: string | null, batchIds: string[]): Promise<BatchListExtras> {
  const admin = createAdminClient();
  const settlements = await fetchAllIn<{ id: string; batch_id: string | null; case_id: string }>(batchIds, (chunk, from, to) =>
    admin.from('settlements').select('id, batch_id, case_id').in('batch_id', chunk).neq('status', 'canceled').range(from, to),
  );
  const settlementIds = settlements.map((s) => s.id);
  const [logs, scopeCases, inactive] = await Promise.all([
    fetchAllIn<{ settlement_id: string | null; started_at: string; ended_at: string }>(settlementIds, (chunk, from, to) =>
      admin.from('mentoring_logs').select('settlement_id, started_at, ended_at').in('settlement_id', chunk).range(from, to),
    ),
    fetchAll<{ id: string; mentee_id: string | null; support_type_id: string }>((from, to) => {
      let q = admin.from('cases').select('id, mentee_id, support_type_id').eq('program_id', programId);
      if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
      return q.order('id').range(from, to);
    }),
    loadInactiveMemberIds(programId, 'mentee'),
  ]);
  // 품의 정산의 케이스가 범위 밖일 수 있어(행사 전체 품의) 케이스 → 멘티는 따로 읽는다
  const caseIds = Array.from(new Set(settlements.map((s) => s.case_id)));
  const caseMentee = new Map(scopeCases.map((c) => [c.id, c.mentee_id ?? c.id]));
  const missing = caseIds.filter((id) => !caseMentee.has(id));
  if (missing.length) {
    const extra = await fetchAllIn<{ id: string; mentee_id: string | null }>(missing, (chunk, from, to) => admin.from('cases').select('id, mentee_id').in('id', chunk).range(from, to));
    for (const c of extra) caseMentee.set(c.id, c.mentee_id ?? c.id);
  }
  const batchOfSettlement = new Map(settlements.map((s) => [s.id, s.batch_id]));
  const minutesByBatch = new Map<string, number>();
  for (const l of logs) {
    const b = l.settlement_id ? batchOfSettlement.get(l.settlement_id) : null;
    if (b) minutesByBatch.set(b, (minutesByBatch.get(b) ?? 0) + minutesOf(l));
  }
  const menteesByBatch = new Map<string, string[]>();
  for (const s of settlements) {
    if (!s.batch_id) continue;
    const m = caseMentee.get(s.case_id) ?? s.case_id;
    const cur = menteesByBatch.get(s.batch_id) ?? [];
    if (!cur.includes(m)) cur.push(m);
    menteesByBatch.set(s.batch_id, cur);
  }
  const listed = new Set<string>();
  for (const ids of Array.from(menteesByBatch.values())) for (const m of ids) listed.add(m);
  const total = new Set<string>();
  for (const c of scopeCases) {
    const m = c.mentee_id ?? c.id;
    if (c.mentee_id && inactive.has(c.mentee_id) && !listed.has(m)) continue;
    total.add(m);
  }
  for (const m of Array.from(listed)) total.add(m);
  return { minutesByBatch, menteesByBatch, listedMentees: listed.size, totalMentees: total.size };
}

// ───────────────────────────────────────────── 아직 검수·정산에 안 들어온 멘티

/** 검수 전 진행 단계 — 이 상태의 케이스는 아직 검수·정산에 들어오지 않았다 */
const OPEN_STATUSES: CaseStatus[] = ['mentor_assigned', 'in_progress', 'reassignment_pending', 'revision_requested'];

export interface OpenProgressRow {
  caseId: string;
  menteeId: string | null;
  menteeName: string;
  menteePhone: string | null;
  groupName: string | null;
  status: CaseStatus;
  /** '중도 포기' 등 운영사 표시 */
  outcomeLabel: string | null;
  /** 진행 멘토 — 활성 배정, 없으면 마지막 진행 멘토 */
  mentorId: string | null;
  mentorName: string | null;
  mentorPhone: string | null;
  mentorActive: boolean;
  requiredRounds: number;
  /** 보고서까지 등록된 회차 / 등록된 회차 전체 */
  reported: number;
  planned: number;
  /** 보고서 등록 + 미정산 회차 (정산에 아직 안 들어온 회차) */
  unsettledRounds: number;
  unsettledAmount: number;
  /** 보고서 등록 회차의 멘토링 시간(분) */
  reportedMinutes: number;
  /** 지금 진행 멘토가 아닌 멘토의 미정산 회차 — 중도 변경 잔여 회차 */
  otherMentorUnsettled: { mentorId: string; name: string; rounds: number }[];
  lastRoundAt: string | null;
  /** 목록에 오른 이유 */
  reason: 'open' | 'unsettled';
}

export async function loadOpenProgress(programId: string, supportTypeId: string | null): Promise<OpenProgressRow[]> {
  const admin = createAdminClient();
  const [cases, inactive] = await Promise.all([
    listCases({ programId, supportTypeId: supportTypeId ?? undefined, admin: true }),
    loadInactiveMemberIds(programId, 'mentee'),
  ]);
  const candidates = cases.filter((c) => !['closure_requested', 'settlement_pending', 'settlement_batched', 'closed'].includes(c.status));
  const logs = await fetchAllIn<{ case_id: string; mentor_id: string; started_at: string; ended_at: string; report_registered_at: string | null; settlement_id: string | null; amount_snapshot: number | null }>(
    candidates.map((c) => c.id),
    (chunk, from, to) => admin.from('mentoring_logs').select('case_id, mentor_id, started_at, ended_at, report_registered_at, settlement_id, amount_snapshot').in('case_id', chunk).range(from, to),
  );
  const logsByCase = new Map<string, typeof logs>();
  for (const l of logs) logsByCase.set(l.case_id, [...(logsByCase.get(l.case_id) ?? []), l]);

  const rows: OpenProgressRow[] = [];
  const mentorIds = new Set<string>();
  for (const c of candidates) {
    const ls = logsByCase.get(c.id) ?? [];
    const reportedLogs = ls.filter((l) => !!l.report_registered_at);
    const unsettled = reportedLogs.filter((l) => !l.settlement_id);
    const open = OPEN_STATUSES.includes(c.status as CaseStatus);
    const outcome = (c as { mentoring_outcome?: string | null }).mentoring_outcome ?? null;
    // 진행 단계라도 포기·종료로 표시됐거나 비활성 멘티는 미정산 회차가 있을 때만 남긴다
    const quiet = !!outcome || (!!c.mentee_id && inactive.has(c.mentee_id));
    if (!(open && !quiet) && unsettled.length === 0) continue;
    if (c.status === 'registered' && unsettled.length === 0) continue;

    const activeMentorId = c.mentorId && !c.mentorEnded ? c.mentorId : null;
    const mentorId = activeMentorId ?? c.pastMentorId ?? c.mentorId ?? null;
    const others = new Map<string, number>();
    for (const l of unsettled) if (l.mentor_id !== mentorId) others.set(l.mentor_id, (others.get(l.mentor_id) ?? 0) + 1);
    for (const id of Array.from(others.keys())) mentorIds.add(id);
    if (mentorId) mentorIds.add(mentorId);
    const last = ls.map((l) => l.started_at).sort().pop() ?? null;
    rows.push({
      caseId: c.id,
      menteeId: c.mentee_id,
      menteeName: menteeLabel(c.owner_name, c.business_name),
      menteePhone: c.phone ?? null,
      groupName: c.supportTypeName,
      status: c.status as CaseStatus,
      outcomeLabel: mentoringOutcomeLabel(outcome as never, c.roundsProgressed),
      mentorId,
      mentorName: activeMentorId ? c.mentorName : c.pastMentorName ? pastMentorLabel(c.pastMentorName, c.pastMentorEndKind) : c.mentorName,
      mentorPhone: null,
      mentorActive: !!activeMentorId,
      requiredRounds: c.requiredRounds,
      reported: reportedLogs.length,
      planned: ls.length,
      unsettledRounds: unsettled.length,
      unsettledAmount: unsettled.reduce((a, l) => a + Number(l.amount_snapshot ?? 0), 0),
      reportedMinutes: reportedLogs.reduce((a, l) => a + minutesOf(l), 0),
      otherMentorUnsettled: Array.from(others.entries()).map(([id, rounds]) => ({ mentorId: id, name: '', rounds })),
      lastRoundAt: last,
      reason: open && !quiet ? 'open' : 'unsettled',
    });
  }
  if (mentorIds.size) {
    const users = await fetchAllIn<{ id: string; name: string; phone: string | null }>(Array.from(mentorIds), (chunk, from, to) => admin.from('users').select('id, name, phone').in('id', chunk).range(from, to));
    const byId = new Map(users.map((u) => [u.id, u]));
    for (const r of rows) {
      if (r.mentorId) r.mentorPhone = byId.get(r.mentorId)?.phone ?? null;
      for (const o of r.otherMentorUnsettled) o.name = byId.get(o.mentorId)?.name ?? '멘토';
    }
  }
  return rows.sort((a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? '', 'ko') || (a.mentorName ?? '').localeCompare(b.mentorName ?? '', 'ko') || a.menteeName.localeCompare(b.menteeName, 'ko'));
}

/** 품의에 아직 오르지 않은 지급 대기 정산 (정산 건 탭 폐지 후 — 배너로 [품의로 올리기]) */
export async function listUnbatchedPending(programId: string, supportTypeId: string | null): Promise<{ id: string; case_id: string; net: number }[]> {
  const admin = createAdminClient();
  const rows = await fetchAll<{ id: string; case_id: string; net: number }>((from, to) =>
    admin.from('settlements').select('id, case_id, net').eq('program_id', programId).eq('status', 'pending').is('batch_id', null).order('id').range(from, to),
  );
  if (!supportTypeId || rows.length === 0) return rows.map((r) => ({ ...r, net: Number(r.net) }));
  const cs = await fetchAllIn<{ id: string; support_type_id: string }>(Array.from(new Set(rows.map((r) => r.case_id))), (chunk, from, to) => admin.from('cases').select('id, support_type_id').in('id', chunk).range(from, to));
  const inScope = new Set(cs.filter((c) => c.support_type_id === supportTypeId).map((c) => c.id));
  return rows.filter((r) => inScope.has(r.case_id)).map((r) => ({ ...r, net: Number(r.net) }));
}
