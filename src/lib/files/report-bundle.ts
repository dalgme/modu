import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllIn } from '@/lib/supabase/paginate';
import { safeFileName } from '@/lib/http/download';
import { buildDownloadName } from '@/lib/files/download-name-rule';
import { reportDocKey } from '@/lib/data/rounds';
import { kstYmd } from '@/lib/utils/kst';

/**
 * 컨설팅 보고서·관찰의견서 묶음 다운로드 목록 (2026-09-30).
 * 서버는 **파일 목록(ZIP 안 경로 + 짧은 서명 URL)** 만 만들고, 브라우저가 파일을 받아 ZIP 으로 묶는다
 * (Vercel 함수 응답 4.5MB 한도·60초 제한을 피하기 위해 — 라운드 전체는 수백 MB 가 될 수 있다).
 *  - case   (②) : "멘토명-멘티명/" 아래 그 멘토의 회차 보고서 + 멘티 관찰의견서 (mentorId 지정 시 그 멘토 회차만)
 *  - mentor (③) : "멘토명/멘티명/" — 그 멘토가 배정됐거나 회차를 진행한 멘티 전부
 *  - group  (④) : "라운드명/멘토명/멘티명/" — 그 라운드(사업그룹)의 멘티 전부
 * 회차 보고서의 멘토 폴더 = 그 회차를 진행한 멘토(멘토 교체 시 나뉨). 관찰의견서 = 올린 멘토, 모르면 마지막 멘토.
 */
export type BundleScope = 'case' | 'mentor' | 'group';

export interface BundleFile {
  path: string;
  url: string;
}

export interface BundleManifest {
  zipName: string;
  files: BundleFile[];
  /** 보고서가 아직 없는 멘티(폴더만 없는 경우) 수 — 안내용 */
  emptyCases: number;
}

const clean = (s: string | null | undefined, fallback: string) => safeFileName((s ?? '').trim() || fallback, 60);

interface CaseRow {
  id: string;
  owner_name: string;
  support_type_id: string;
  program_id: string;
}

export async function buildReportBundle(input: {
  programId: string;
  scope: BundleScope;
  /** case = 케이스 id · mentor = 멘토 id · group = 사업그룹 id */
  id: string;
  /** case 범위에서 특정 멘토 회차만 */
  mentorId?: string | null;
}): Promise<{ ok: true; manifest: BundleManifest } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: program } = await admin.from('programs').select('name').eq('id', input.programId).maybeSingle();
  if (!program) return { ok: false, error: '행사를 찾을 수 없습니다.' };

  // 1) 대상 케이스
  let cases: CaseRow[] = [];
  let groupName = '';
  if (input.scope === 'case') {
    const { data } = await admin.from('cases').select('id, owner_name, support_type_id, program_id').eq('id', input.id).maybeSingle();
    if (!data || data.program_id !== input.programId) return { ok: false, error: '케이스를 찾을 수 없습니다.' };
    cases = [data];
  } else if (input.scope === 'mentor') {
    const [assigns, logs] = await Promise.all([
      admin.from('mentor_assignments').select('case_id').eq('mentor_id', input.id),
      admin.from('mentoring_logs').select('case_id').eq('mentor_id', input.id),
    ]);
    const ids = Array.from(new Set([...(assigns.data ?? []), ...(logs.data ?? [])].map((r) => r.case_id)));
    cases = (await fetchAllIn<CaseRow>(ids, (chunk, from, to) => admin.from('cases').select('id, owner_name, support_type_id, program_id').in('id', chunk).range(from, to))).filter((c) => c.program_id === input.programId);
  } else {
    const { data: g } = await admin.from('support_types').select('id, name, program_id').eq('id', input.id).maybeSingle();
    if (!g || g.program_id !== input.programId) return { ok: false, error: '라운드(사업그룹)를 찾을 수 없습니다.' };
    groupName = g.name;
    const { data } = await admin.from('cases').select('id, owner_name, support_type_id, program_id').eq('program_id', input.programId).eq('support_type_id', g.id);
    cases = data ?? [];
  }
  if (cases.length === 0) return { ok: false, error: '대상 멘티가 없습니다.' };
  const caseIds = cases.map((c) => c.id);

  // 2) 회차·보고서·관찰의견서·멘토 이름
  const [logs, docs, assigns] = await Promise.all([
    fetchAllIn<{ id: string; case_id: string; round_no: number; mentor_id: string }>(caseIds, (chunk, from, to) =>
      admin.from('mentoring_logs').select('id, case_id, round_no, mentor_id').in('case_id', chunk).not('report_registered_at', 'is', null).range(from, to),
    ),
    fetchAllIn<{ case_id: string; doc_key: string; doc_name: string; storage_path: string; uploaded_by: string | null }>(caseIds, (chunk, from, to) =>
      admin.from('documents').select('case_id, doc_key, doc_name, storage_path, uploaded_by').in('case_id', chunk).or('doc_key.like.mentoring_report:%,doc_key.eq.observation_report').range(from, to),
    ),
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; assigned_at: string }>(caseIds, (chunk, from, to) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active, assigned_at').in('case_id', chunk).range(from, to),
    ),
  ]);
  const mentorIds = Array.from(new Set([...logs.map((l) => l.mentor_id), ...assigns.map((a) => a.mentor_id)]));
  const users = await fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, from, to) => admin.from('users').select('id, name').in('id', chunk).range(from, to));
  const mentorName = new Map(users.map((u) => [u.id, u.name]));
  const reportByLog = new Map(docs.filter((d) => d.doc_key.startsWith('mentoring_report:')).map((d) => [d.doc_key, d]));
  const obsByCase = new Map(docs.filter((d) => d.doc_key === 'observation_report').map((d) => [d.case_id, d]));
  const logsByCase = new Map<string, typeof logs>();
  for (const l of logs) (logsByCase.get(l.case_id) ?? logsByCase.set(l.case_id, []).get(l.case_id)!).push(l);
  /** 케이스의 마지막(활성 우선) 멘토 */
  const lastMentor = new Map<string, string>();
  for (const a of [...assigns].sort((x, y) => Number(x.is_active) - Number(y.is_active) || (x.assigned_at ?? '').localeCompare(y.assigned_at ?? ''))) lastMentor.set(a.case_id, a.mentor_id);

  // 동명이인 멘티 폴더 구분
  const nameCount = new Map<string, number>();
  for (const c of cases) nameCount.set(c.owner_name, (nameCount.get(c.owner_name) ?? 0) + 1);
  const menteeFolder = (c: CaseRow) => clean(nameCount.get(c.owner_name)! > 1 ? `${c.owner_name}_${c.id.slice(0, 4)}` : c.owner_name, '멘티');

  // 3) ZIP 안 경로
  const wanted: { path: string; storagePath: string }[] = [];
  const used = new Set<string>();
  const push = (dir: string, fileName: string, storagePath: string) => {
    let p = `${dir}/${safeFileName(fileName, 120)}`;
    for (let i = 2; used.has(p); i += 1) {
      const dot = p.lastIndexOf('.');
      p = dot > p.lastIndexOf('/') ? `${p.slice(0, dot)} (${i})${p.slice(dot)}` : `${p} (${i})`;
    }
    used.add(p);
    wanted.push({ path: p, storagePath });
  };
  const dirFor = (c: CaseRow, mentorId: string) => {
    const m = clean(mentorName.get(mentorId), '멘토');
    const mentee = menteeFolder(c);
    if (input.scope === 'case') return `${m}-${mentee}`;
    if (input.scope === 'mentor') return `${m}/${mentee}`;
    return `${clean(groupName, '라운드')}/${m}/${mentee}`;
  };

  let emptyCases = 0;
  for (const c of [...cases].sort((a, b) => a.owner_name.localeCompare(b.owner_name, 'ko'))) {
    let added = 0;
    for (const l of (logsByCase.get(c.id) ?? []).sort((a, b) => a.round_no - b.round_no)) {
      if (input.scope === 'mentor' && l.mentor_id !== input.id) continue;
      if (input.scope === 'case' && input.mentorId && l.mentor_id !== input.mentorId) continue;
      const d = reportByLog.get(reportDocKey(l.id));
      if (!d) continue;
      // 파일명 규칙 "멘토명-멘티명-N회차 보고서" (2026-09-30)
      push(dirFor(c, l.mentor_id), buildDownloadName({ docKey: `mentoring_report:${l.id}`, sourceName: d.doc_name || d.storage_path, menteeName: c.owner_name, mentorName: mentorName.get(l.mentor_id) ?? null, roundNo: l.round_no }), d.storage_path);
      added += 1;
    }
    const obs = obsByCase.get(c.id);
    const obsMentor = obs?.uploaded_by && mentorName.has(obs.uploaded_by) ? obs.uploaded_by : lastMentor.get(c.id) ?? null;
    const obsWanted = obs && obsMentor && (input.scope !== 'mentor' || obsMentor === input.id) && (input.scope !== 'case' || !input.mentorId || obsMentor === input.mentorId);
    if (obs && obsMentor && obsWanted) {
      push(dirFor(c, obsMentor), buildDownloadName({ docKey: 'observation_report', sourceName: obs.doc_name || obs.storage_path, menteeName: c.owner_name, mentorName: mentorName.get(obsMentor) ?? null }), obs.storage_path);
      added += 1;
    }
    if (added === 0) emptyCases += 1;
  }
  if (wanted.length === 0) return { ok: false, error: '아직 올라온 보고서·관찰의견서가 없습니다.' };

  // 4) 서명 URL (10분) — 100개씩
  const files: BundleFile[] = [];
  for (let i = 0; i < wanted.length; i += 100) {
    const chunk = wanted.slice(i, i + 100);
    const { data, error } = await admin.storage.from('documents').createSignedUrls(chunk.map((w) => w.storagePath), 600);
    if (error) return { ok: false, error: `파일 주소를 만들지 못했습니다: ${error.message}` };
    chunk.forEach((w, idx) => {
      const url = data?.[idx]?.signedUrl;
      if (url) files.push({ path: w.path, url });
    });
  }

  // 5) ZIP 이름
  const today = kstYmd(new Date());
  const c0 = cases[0]!;
  const zipBase =
    input.scope === 'case'
      ? `${input.mentorId ? `${clean(mentorName.get(input.mentorId), '멘토')}-` : lastMentor.get(c0.id) ? `${clean(mentorName.get(lastMentor.get(c0.id)!), '멘토')}-` : ''}${menteeFolder(c0)}_컨설팅보고서`
      : input.scope === 'mentor'
        ? `${clean(mentorName.get(input.id), '멘토')}_담당멘티_컨설팅보고서`
        : `${clean(program.name, '행사')}_${clean(groupName, '라운드')}_컨설팅보고서`;
  return { ok: true, manifest: { zipName: safeFileName(`${zipBase}_${today}.zip`), files, emptyCases } };
}
