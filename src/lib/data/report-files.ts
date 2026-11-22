import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { reportDocKey } from '@/lib/data/rounds';
import { mergedReportStatusForCases } from '@/lib/files/merged-report';
import type { MergedReportStatus } from '@/lib/files/merged-report-shared';
import { loadInactiveMemberIds } from '@/lib/data/inactive-members';
import { observationRequiredMap } from '@/lib/workflow/observation-required';
import { isProgressedRound } from '@/lib/workflow/force-end-rule';
import { mentoringOutcomeLabel, normalizeMentoringOutcome } from '@/lib/workflow/mentoring-outcome';
import { CASE_STATUS_META, isCaseStatus } from '@/types/case-status';
import { menteeLabel } from '@/lib/utils/labels';
import { excludedFromFileCounts, isObservationMissing, type ObsMissingData, type ObsMissingRow } from '@/lib/reports/observation-missing-shared';

/** 관찰의견서 요청 문자 감사 action — 멘토별 1행(entity=users), "최근 요청" 표시 근거 */
export const OBS_REQUEST_ACTION = 'sms.observation_request';
/**
 * 리포트 [보고서 파일] 탭 데이터 (2026-09-30) — 운영사·발주처 공용.
 * 회차 보고서·관찰의견서 파일을 ① 회차별 개별 ② 멘토-멘티 ZIP ③ 멘토 폴더 ZIP ④ 라운드 폴더 ZIP 으로 받게 한다.
 * 파일 자체는 `/api/files/doc/{id}`(미리보기·다운로드)와 `/api/files/report-bundle`(ZIP 목록)이 권한 확인 후 내준다.
 * (2026-11-22) 멘티 수·표에서 회차를 한 번도 진행하지 않고 끝난 멘티(포기·종료 표시·중도 종료·비활성화)를 뺀다
 * — 1회 이상 진행 후 포기·종료한 멘티는 그대로 센다(excludedFromFileCounts). 관찰의견서 미제출 명단(obsMissing)도 같은 기준.
 */
export interface ReportFileRound {
  roundNo: number;
  mode: string;
  docId: string | null;
  fileName: string | null;
  mentorName: string | null;
}

export interface ReportFileRow {
  caseId: string;
  menteeName: string;
  groupName: string;
  mentorName: string | null;
  requiredRounds: number;
  rounds: ReportFileRound[];
  observation: { docId: string; name: string } | null;
  /** 회차 보고서 합본 PDF (2026-11-10) */
  merged: MergedReportStatus;
}

export interface ReportFilesData {
  /** mergeTodo = 합본이 없거나 다시 만들어야 하는 멘티(보고서 있는 경우만) */
  groups: { id: string; name: string; caseCount: number; fileCount: number; obsCount: number; mergeTodo: string[] }[];
  mentors: { id: string; name: string; caseCount: number; fileCount: number }[];
  rows: ReportFileRow[];
  /** 관찰의견서 미제출 확인 · 요청 문자 (2026-11-22) */
  obsMissing: ObsMissingData;
  /** 멘티 수에서 뺀 멘티(진행 없이 끝남) 수 */
  excludedCount: number;
}

export async function loadReportFiles(programId: string, groupId: string | null): Promise<ReportFilesData> {
  const admin = createAdminClient();
  const [groupsAll, cases] = await Promise.all([
    fetchAll<{ id: string; name: string; required_rounds: number }>((from, to) => admin.from('support_types').select('id, name, required_rounds').eq('program_id', programId).order('name').range(from, to)),
    fetchAll<{ id: string; owner_name: string; business_name: string | null; support_type_id: string; status: string; mentee_id: string | null; mentoring_outcome: string | null; early_closure_at: string | null }>((from, to) => {
      let q = admin.from('cases').select('id, owner_name, business_name, support_type_id, status, mentee_id, mentoring_outcome, early_closure_at').eq('program_id', programId);
      if (groupId) q = q.eq('support_type_id', groupId);
      return q.order('owner_name').range(from, to);
    }),
  ]);
  const allCaseIds = cases.map((c) => c.id);
  const [allLogs, inactive, obsRequired] = await Promise.all([
    fetchAllIn<{ id: string; case_id: string; round_no: number; mode: string; mentor_id: string; report_registered_at: string | null; started_at: string; ended_at: string | null }>(allCaseIds, (chunk, from, to) =>
      admin.from('mentoring_logs').select('id, case_id, round_no, mode, mentor_id, report_registered_at, started_at, ended_at').in('case_id', chunk).range(from, to),
    ),
    loadInactiveMemberIds(programId, 'mentee'),
    observationRequiredMap(groupsAll.map((g) => g.id)),
  ]);
  // 회차를 한 번도 진행하지 않고 끝난 멘티는 이 탭의 멘티 수·표에서 뺀다
  const now = Date.now();
  const progressed = new Map<string, number>();
  for (const l of allLogs) if (isProgressedRound(l, now)) progressed.set(l.case_id, (progressed.get(l.case_id) ?? 0) + 1);
  const excluded = new Set(
    cases
      .filter((c) => excludedFromFileCounts({ menteeInactive: !!c.mentee_id && inactive.has(c.mentee_id), outcome: c.mentoring_outcome, status: c.status, progressedRounds: progressed.get(c.id) ?? 0 }))
      .map((c) => c.id),
  );
  const counted = cases.filter((c) => !excluded.has(c.id));
  const caseIds = counted.map((c) => c.id);
  const logs = allLogs.filter((l) => !excluded.has(l.case_id));
  const [docs, assigns] = await Promise.all([
    fetchAllIn<{ id: string; case_id: string; doc_key: string; doc_name: string; uploaded_by: string | null }>(caseIds, (chunk, from, to) =>
      admin.from('documents').select('id, case_id, doc_key, doc_name, uploaded_by').in('case_id', chunk).or('doc_key.like.mentoring_report:%,doc_key.eq.observation_report').range(from, to),
    ),
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; assigned_at: string }>(caseIds, (chunk, from, to) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active, assigned_at').in('case_id', chunk).range(from, to),
    ),
  ]);
  const mergedStatus = await mergedReportStatusForCases(caseIds);
  const mentorIds = Array.from(new Set([...logs.map((l) => l.mentor_id), ...assigns.map((a) => a.mentor_id)]));
  const users = await fetchAllIn<{ id: string; name: string; phone: string | null }>(mentorIds, (chunk, from, to) => admin.from('users').select('id, name, phone').in('id', chunk).range(from, to));
  const phoneOf = new Map(users.map((u) => [u.id, u.phone]));
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const groupOf = new Map(groupsAll.map((g) => [g.id, g]));
  const reportByKey = new Map(docs.filter((d) => d.doc_key.startsWith('mentoring_report:')).map((d) => [d.doc_key, d]));
  const obsByCase = new Map(docs.filter((d) => d.doc_key === 'observation_report').map((d) => [d.case_id, d]));
  const lastMentor = new Map<string, string>();
  for (const a of [...assigns].sort((x, y) => Number(x.is_active) - Number(y.is_active) || x.assigned_at.localeCompare(y.assigned_at))) lastMentor.set(a.case_id, a.mentor_id);
  const logsByCase = new Map<string, typeof logs>();
  for (const l of logs) (logsByCase.get(l.case_id) ?? logsByCase.set(l.case_id, []).get(l.case_id)!).push(l);

  const rows: ReportFileRow[] = [];
  const groupStat = new Map<string, { caseCount: number; fileCount: number; obsCount: number }>();
  const mentorStat = new Map<string, { cases: Set<string>; fileCount: number }>();
  const bumpMentor = (id: string, caseId: string, files: number) => {
    const s = mentorStat.get(id) ?? mentorStat.set(id, { cases: new Set(), fileCount: 0 }).get(id)!;
    s.cases.add(caseId);
    s.fileCount += files;
  };
  const activeMentor = new Map<string, string>();
  for (const a of assigns) if (a.is_active) activeMentor.set(a.case_id, a.mentor_id);
  const missingRows: ObsMissingRow[] = [];
  const obsStat = new Map<string, { target: number; submitted: number; missing: number }>();
  for (const c of counted) {
    const g = groupOf.get(c.support_type_id);
    const rounds = (logsByCase.get(c.id) ?? [])
      .sort((a, b) => a.round_no - b.round_no)
      .map((l) => {
        const d = l.report_registered_at ? reportByKey.get(reportDocKey(l.id)) : undefined;
        bumpMentor(l.mentor_id, c.id, d ? 1 : 0);
        return { roundNo: l.round_no, mode: l.mode, docId: d?.id ?? null, fileName: d?.doc_name ?? null, mentorName: nameOf.get(l.mentor_id) ?? null };
      });
    const obs = obsByCase.get(c.id);
    const last = lastMentor.get(c.id) ?? null;
    if (last) bumpMentor(last, c.id, 0);
    const obsMentor = obs?.uploaded_by && nameOf.has(obs.uploaded_by) ? obs.uploaded_by : last;
    if (obs && obsMentor) bumpMentor(obsMentor, c.id, 1);
    const fileCount = rounds.filter((r) => r.docId).length + (obs ? 1 : 0);
    const gs = groupStat.get(c.support_type_id) ?? groupStat.set(c.support_type_id, { caseCount: 0, fileCount: 0, obsCount: 0 }).get(c.support_type_id)!;
    gs.caseCount += 1;
    gs.fileCount += fileCount;
    if (obs) gs.obsCount += 1;
    // 관찰의견서 대상·제출·미제출 (관찰의견서를 내는 라운드만)
    const required = obsRequired.get(c.support_type_id) ?? true;
    if (required && !c.early_closure_at) {
      const os = obsStat.get(c.support_type_id) ?? obsStat.set(c.support_type_id, { target: 0, submitted: 0, missing: 0 }).get(c.support_type_id)!;
      os.target += 1;
      if (obs) os.submitted += 1;
      if (isObservationMissing({ status: c.status, observationRequired: required, hasObservation: !!obs, earlyClosure: !!c.early_closure_at, countedInFiles: true })) {
        os.missing += 1;
        const mid = activeMentor.get(c.id) ?? null;
        missingRows.push({
          caseId: c.id,
          menteeName: menteeLabel(c.owner_name, c.business_name),
          groupId: c.support_type_id,
          groupName: g?.name ?? '',
          mentorId: mid,
          mentorName: mid ? nameOf.get(mid) ?? null : null,
          mentorPhone: mid ? phoneOf.get(mid) ?? null : null,
          statusLabel: isCaseStatus(c.status) ? CASE_STATUS_META[c.status].short : c.status,
          outcomeLabel: mentoringOutcomeLabel(normalizeMentoringOutcome(c.mentoring_outcome), progressed.get(c.id) ?? 0),
          reportsDone: rounds.filter((r) => r.docId).length,
          requiredRounds: g?.required_rounds ?? 0,
        });
      }
    }
    rows.push({
      caseId: c.id,
      menteeName: c.owner_name,
      groupName: g?.name ?? '',
      mentorName: last ? nameOf.get(last) ?? null : null,
      requiredRounds: g?.required_rounds ?? 0,
      rounds,
      observation: obs ? { docId: obs.id, name: obs.doc_name } : null,
      merged: mergedStatus.get(c.id) ?? { doc: null, reportRounds: [], includedRounds: [], missingRounds: [], stale: false },
    });
  }
  return {
    groups: groupsAll
      .filter((g) => !groupId || g.id === groupId)
      .map((g) => ({
        id: g.id,
        name: g.name,
        caseCount: groupStat.get(g.id)?.caseCount ?? 0,
        fileCount: groupStat.get(g.id)?.fileCount ?? 0,
        obsCount: groupStat.get(g.id)?.obsCount ?? 0,
        mergeTodo: counted
          .filter((c) => c.support_type_id === g.id)
          .map((c) => c.id)
          .filter((id) => {
            const m = mergedStatus.get(id);
            return !!m && m.reportRounds.length > 0 && (!m.doc || m.stale);
          }),
      })),
    mentors: Array.from(mentorStat.entries())
      .map(([id, s]) => ({ id, name: nameOf.get(id) ?? '(이름 없음)', caseCount: s.cases.size, fileCount: s.fileCount }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    rows,
    obsMissing: {
      groups: groupsAll
        .filter((g) => !groupId || g.id === groupId)
        .map((g) => ({ groupId: g.id, groupName: g.name, required: obsRequired.get(g.id) ?? true, target: obsStat.get(g.id)?.target ?? 0, submitted: obsStat.get(g.id)?.submitted ?? 0, missing: obsStat.get(g.id)?.missing ?? 0 })),
      rows: missingRows.sort((a, b) => (a.mentorName ?? '힣').localeCompare(b.mentorName ?? '힣', 'ko') || a.menteeName.localeCompare(b.menteeName, 'ko')),
      lastRequested: await lastObservationRequests(programId, Array.from(new Set(missingRows.map((r) => r.mentorId).filter((x): x is string => !!x)))),
    },
    excludedCount: excluded.size,
  };
}

/** 멘토별 최근 관찰의견서 요청 문자 시각 */
async function lastObservationRequests(programId: string, mentorIds: string[]): Promise<Record<string, string>> {
  if (mentorIds.length === 0) return {};
  const admin = createAdminClient();
  const rows = await fetchAllIn<{ entity_id: string | null; created_at: string }>(mentorIds, (chunk, from, to) =>
    admin.from('audit_logs').select('entity_id, created_at').eq('program_id', programId).eq('action', OBS_REQUEST_ACTION).eq('metadata->>sent', 'true').in('entity_id', chunk).order('created_at', { ascending: false }).range(from, to),
  );
  const out: Record<string, string> = {};
  for (const r of rows) if (r.entity_id && !out[r.entity_id]) out[r.entity_id] = r.created_at;
  return out;
}
