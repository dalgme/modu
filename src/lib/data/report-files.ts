import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { reportDocKey } from '@/lib/data/rounds';

/**
 * 리포트 [보고서 파일] 탭 데이터 (2026-09-30) — 운영사·발주처 공용.
 * 회차 보고서·관찰의견서 파일을 ① 회차별 개별 ② 멘토-멘티 ZIP ③ 멘토 폴더 ZIP ④ 라운드 폴더 ZIP 으로 받게 한다.
 * 파일 자체는 `/api/files/doc/{id}`(미리보기·다운로드)와 `/api/files/report-bundle`(ZIP 목록)이 권한 확인 후 내준다.
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
}

export interface ReportFilesData {
  groups: { id: string; name: string; caseCount: number; fileCount: number }[];
  mentors: { id: string; name: string; caseCount: number; fileCount: number }[];
  rows: ReportFileRow[];
}

export async function loadReportFiles(programId: string, groupId: string | null): Promise<ReportFilesData> {
  const admin = createAdminClient();
  const [groupsAll, cases] = await Promise.all([
    fetchAll<{ id: string; name: string; required_rounds: number }>((from, to) => admin.from('support_types').select('id, name, required_rounds').eq('program_id', programId).order('name').range(from, to)),
    fetchAll<{ id: string; owner_name: string; support_type_id: string }>((from, to) => {
      let q = admin.from('cases').select('id, owner_name, support_type_id').eq('program_id', programId);
      if (groupId) q = q.eq('support_type_id', groupId);
      return q.order('owner_name').range(from, to);
    }),
  ]);
  const caseIds = cases.map((c) => c.id);
  const [logs, docs, assigns] = await Promise.all([
    fetchAllIn<{ id: string; case_id: string; round_no: number; mode: string; mentor_id: string; report_registered_at: string | null }>(caseIds, (chunk, from, to) =>
      admin.from('mentoring_logs').select('id, case_id, round_no, mode, mentor_id, report_registered_at').in('case_id', chunk).range(from, to),
    ),
    fetchAllIn<{ id: string; case_id: string; doc_key: string; doc_name: string; uploaded_by: string | null }>(caseIds, (chunk, from, to) =>
      admin.from('documents').select('id, case_id, doc_key, doc_name, uploaded_by').in('case_id', chunk).or('doc_key.like.mentoring_report:%,doc_key.eq.observation_report').range(from, to),
    ),
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; assigned_at: string }>(caseIds, (chunk, from, to) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active, assigned_at').in('case_id', chunk).range(from, to),
    ),
  ]);
  const mentorIds = Array.from(new Set([...logs.map((l) => l.mentor_id), ...assigns.map((a) => a.mentor_id)]));
  const users = await fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).range(from, to));
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const groupOf = new Map(groupsAll.map((g) => [g.id, g]));
  const reportByKey = new Map(docs.filter((d) => d.doc_key.startsWith('mentoring_report:')).map((d) => [d.doc_key, d]));
  const obsByCase = new Map(docs.filter((d) => d.doc_key === 'observation_report').map((d) => [d.case_id, d]));
  const lastMentor = new Map<string, string>();
  for (const a of [...assigns].sort((x, y) => Number(x.is_active) - Number(y.is_active) || x.assigned_at.localeCompare(y.assigned_at))) lastMentor.set(a.case_id, a.mentor_id);
  const logsByCase = new Map<string, typeof logs>();
  for (const l of logs) (logsByCase.get(l.case_id) ?? logsByCase.set(l.case_id, []).get(l.case_id)!).push(l);

  const rows: ReportFileRow[] = [];
  const groupStat = new Map<string, { caseCount: number; fileCount: number }>();
  const mentorStat = new Map<string, { cases: Set<string>; fileCount: number }>();
  const bumpMentor = (id: string, caseId: string, files: number) => {
    const s = mentorStat.get(id) ?? mentorStat.set(id, { cases: new Set(), fileCount: 0 }).get(id)!;
    s.cases.add(caseId);
    s.fileCount += files;
  };
  for (const c of cases) {
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
    const gs = groupStat.get(c.support_type_id) ?? groupStat.set(c.support_type_id, { caseCount: 0, fileCount: 0 }).get(c.support_type_id)!;
    gs.caseCount += 1;
    gs.fileCount += fileCount;
    rows.push({
      caseId: c.id,
      menteeName: c.owner_name,
      groupName: g?.name ?? '',
      mentorName: last ? nameOf.get(last) ?? null : null,
      requiredRounds: g?.required_rounds ?? 0,
      rounds,
      observation: obs ? { docId: obs.id, name: obs.doc_name } : null,
    });
  }
  return {
    groups: groupsAll
      .filter((g) => !groupId || g.id === groupId)
      .map((g) => ({ id: g.id, name: g.name, caseCount: groupStat.get(g.id)?.caseCount ?? 0, fileCount: groupStat.get(g.id)?.fileCount ?? 0 })),
    mentors: Array.from(mentorStat.entries())
      .map(([id, s]) => ({ id, name: nameOf.get(id) ?? '(이름 없음)', caseCount: s.cases.size, fileCount: s.fileCount }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    rows,
  };
}
