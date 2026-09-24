import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { kstDate } from '@/lib/settlement/rates';
import { resolveRoundReportPolicy } from '@/lib/documents/round-report';
import { checkClosureReadiness, normalizeObservation } from '@/lib/workflow/closure';
import type { CaseStatus } from '@/types/case-status';

/** 운영사 "멘토 입력 대기" 큐 한 행 (P31) — 대행 위주 담당자가 어느 케이스에 무엇을 대신 입력해야 하는지 한눈에 본다. */
export interface MentorInputQueueRow {
  caseId: string;
  menteeName: string;
  businessName: string;
  groupName: string;
  mentorId: string | null;
  mentorName: string | null;
  status: CaseStatus;
  /** 진행일이 지났는데(오늘 이전) 보고서(2단계)가 없는 회차 수 */
  plannedWithoutReport: number;
  /** 보고서까지 등록된(이행) 회차 수 */
  reportedRounds: number;
  requiredRounds: number;
  /** 관찰의견서(웹 작성 총평 또는 업로드본) 존재 */
  hasObservation: boolean;
  /** 멘티 서명 없는 보고서 회차 수 — 그룹 서명 정책이 켜진 경우만, 꺼져 있으면 0 */
  pendingSignatures: number;
  /** 종결 요청 가능(checkClosureReadiness.ok) — in_progress / revision_requested 만 판정 */
  closureReady: boolean;
}

const QUEUE_STATUSES: CaseStatus[] = ['mentor_assigned', 'in_progress', 'revision_requested', 'reassignment_pending'];

/**
 * 행사(+그룹) 범위의 "멘토 입력 대기" 케이스 목록.
 *  - 상태: mentor_assigned / in_progress / revision_requested / reassignment_pending
 *  - 회차·배정·관찰의견서는 페이지 조회(fetchAll/fetchAllIn)로 1,000행 캡을 넘긴다
 *  - 서명 대기는 RoundsList 의 signEnabled 와 같은 해석(resolveRoundReportPolicy.menteeConfirmSignature)을 그룹별로 한 번만 계산
 *  - closureReady 는 회차·관찰의견서가 갖춰진 케이스에만 checkClosureReadiness 를 호출해(서버 게이트와 같은 함수) 비용을 줄인다
 */
export async function listMentorInputQueue(programId: string, supportTypeId: string | null): Promise<MentorInputQueueRow[]> {
  const admin = createAdminClient();
  const today = kstDate(new Date());

  const cases = await fetchAll<{ id: string; owner_name: string; business_name: string; status: CaseStatus; support_type_id: string; program_id: string }>((from, to) => {
    let q = admin.from('cases').select('id, owner_name, business_name, status, support_type_id, program_id').eq('program_id', programId).in('status', QUEUE_STATUSES).order('owner_name');
    if (supportTypeId) q = q.eq('support_type_id', supportTypeId);
    return q.range(from, to);
  });
  if (cases.length === 0) return [];
  const caseIds = cases.map((c) => c.id);
  const groupIds = Array.from(new Set(cases.map((c) => c.support_type_id)));

  const [groups, assigns, logs, obsRows, obsFiles] = await Promise.all([
    fetchAllIn<{ id: string; name: string; required_rounds: number }>(groupIds, (chunk, from, to) => admin.from('support_types').select('id, name, required_rounds').in('id', chunk).range(from, to)),
    fetchAllIn<{ case_id: string; mentor_id: string }>(caseIds, (chunk, from, to) => admin.from('mentor_assignments').select('case_id, mentor_id').in('case_id', chunk).eq('is_active', true).range(from, to)),
    fetchAllIn<{ case_id: string; started_at: string; report_registered_at: string | null; mentee_signed_at: string | null }>(caseIds, (chunk, from, to) =>
      admin.from('mentoring_logs').select('case_id, started_at, report_registered_at, mentee_signed_at').in('case_id', chunk).range(from, to),
    ),
    fetchAllIn<{ case_id: string; content: unknown }>(caseIds, (chunk, from, to) => admin.from('observation_reports').select('case_id, content').in('case_id', chunk).range(from, to)),
    fetchAllIn<{ case_id: string }>(caseIds, (chunk, from, to) => admin.from('documents').select('case_id').in('case_id', chunk).eq('doc_key', 'observation_report').range(from, to)),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const mentorByCase = new Map(assigns.map((a) => [a.case_id, a.mentor_id]));
  const mentorIds = Array.from(new Set(assigns.map((a) => a.mentor_id)));
  const mentors = await fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).range(from, to));
  const mentorName = new Map(mentors.map((m) => [m.id, m.name]));

  // 그룹별 서명 정책 (RoundsList signEnabled 와 같은 해석)
  const signPolicy = new Map<string, boolean>();
  await Promise.all(
    groupIds.map(async (gid) => {
      const p = await resolveRoundReportPolicy(programId, gid);
      signPolicy.set(gid, p.menteeConfirmSignature);
    }),
  );

  const logsByCase = new Map<string, typeof logs>();
  for (const l of logs) {
    const list = logsByCase.get(l.case_id) ?? [];
    list.push(l);
    logsByCase.set(l.case_id, list);
  }
  const obsWeb = new Set(obsRows.filter((o) => normalizeObservation(o.content).summary.trim().length > 0).map((o) => o.case_id));
  const obsFile = new Set(obsFiles.map((d) => d.case_id));

  const rows: MentorInputQueueRow[] = cases.map((c) => {
    const g = groupById.get(c.support_type_id);
    const cl = logsByCase.get(c.id) ?? [];
    const reported = cl.filter((l) => l.report_registered_at);
    const signOn = signPolicy.get(c.support_type_id) ?? false;
    const mentorId = mentorByCase.get(c.id) ?? null;
    return {
      caseId: c.id,
      menteeName: c.owner_name,
      businessName: c.business_name,
      groupName: g?.name ?? '',
      mentorId,
      mentorName: mentorId ? (mentorName.get(mentorId) ?? null) : null,
      status: c.status,
      plannedWithoutReport: cl.filter((l) => !l.report_registered_at && kstDate(l.started_at) < today).length,
      reportedRounds: reported.length,
      requiredRounds: g?.required_rounds ?? 0,
      hasObservation: obsWeb.has(c.id) || obsFile.has(c.id),
      pendingSignatures: signOn ? reported.filter((l) => !l.mentee_signed_at).length : 0,
      closureReady: false,
    };
  });

  // 종결 가능 판정 — 상태·회차·관찰의견서가 갖춰진 케이스만 서버 게이트 함수로 확인
  const candidates = rows.filter((r) => (r.status === 'in_progress' || r.status === 'revision_requested') && r.reportedRounds >= r.requiredRounds && r.hasObservation);
  await Promise.all(
    candidates.map(async (r) => {
      const readiness = await checkClosureReadiness(r.caseId);
      r.closureReady = readiness.ok;
    }),
  );
  return rows;
}
