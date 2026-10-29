import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { reportDocKey } from '@/lib/data/rounds';
import {
  MENTEE_PACKAGE_NAME,
  MENTOR_PACKAGE_NAME,
  cleanName,
  compareExternalNo,
  dedupeNames,
  menteeFolderName,
  pairPdfName,
  partKindOf,
  paymentPdfName,
  type PackageDoc,
  type PackagePart,
  type PackageFolder,
  type RoundPackageManifest,
} from '@/lib/files/round-package-shared';

/**
 * 라운드 제출용 묶음 목록 (2026-10-27) — 서버는 폴더·합본 구성과 서명 URL 만 만들고,
 * 브라우저가 파일을 받아 PDF 로 합치고 ZIP 으로 묶는다(report-bundle 과 같은 이유: 응답 4.5MB·60초 한도).
 *  - 줄 = (멘토, 멘티) 쌍: 회차를 진행했거나, 지금 담당이거나, 끝까지 담당(종결·중도 종료). 회차 없이 회수된 배정은 제외.
 *  - 합본 = 그 멘토가 진행하고 보고서까지 등록한 회차의 보고서(회차순) + 관찰의견서(올린 멘토, 모르면 마지막 멘토).
 *  - 멘토 지급서류 = mentor_payment_files(행사 단위, 순서대로) → "1.수당지급서류 일체_멘토명.pdf".
 */
const URL_TTL = 3600;

interface Pair {
  mentorId: string;
  caseId: string;
}

export async function buildRoundPackage(programId: string, groupId: string, kind: 'mentor' | 'mentee'): Promise<{ ok: true; manifest: RoundPackageManifest; fileCount: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: group } = await admin.from('support_types').select('id, name, program_id').eq('id', groupId).maybeSingle();
  if (!group || group.program_id !== programId) return { ok: false, error: '이 행사의 라운드(사업그룹)가 아닙니다.' };

  const cases = await fetchAll<{ id: string; owner_name: string }>((f, t) => admin.from('cases').select('id, owner_name').eq('program_id', programId).eq('support_type_id', groupId).range(f, t));
  if (cases.length === 0) return { ok: false, error: '이 라운드에 등록된 멘티가 없습니다.' };
  const caseIds = cases.map((c) => c.id);
  const [assigns, logs, docs, profiles] = await Promise.all([
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; assigned_at: string; end_kind: string | null }>(caseIds, (chunk, f, t) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active, assigned_at, end_kind').in('case_id', chunk).range(f, t),
    ),
    fetchAllIn<{ id: string; case_id: string; round_no: number; mentor_id: string; report_registered_at: string | null }>(caseIds, (chunk, f, t) =>
      admin.from('mentoring_logs').select('id, case_id, round_no, mentor_id, report_registered_at').in('case_id', chunk).range(f, t),
    ),
    fetchAllIn<{ case_id: string; doc_key: string; doc_name: string; storage_path: string; mime_type: string | null; uploaded_by: string | null }>(caseIds, (chunk, f, t) =>
      admin.from('documents').select('case_id, doc_key, doc_name, storage_path, mime_type, uploaded_by').in('case_id', chunk).or('doc_key.like.mentoring_report:%,doc_key.eq.observation_report').range(f, t),
    ),
    fetchAllIn<{ case_id: string; external_no: string | null }>(caseIds, (chunk, f, t) => admin.from('mentee_profiles').select('case_id, external_no').in('case_id', chunk).range(f, t)),
  ]);

  // (멘토, 케이스) 쌍
  const pairs = new Map<string, Pair>();
  const addPair = (mentorId: string, caseId: string) => pairs.set(`${mentorId}:${caseId}`, { mentorId, caseId });
  for (const l of logs) addPair(l.mentor_id, l.case_id);
  for (const a of assigns) if (a.is_active || a.end_kind === 'case_closed' || a.end_kind === 'case_withdrawn') addPair(a.mentor_id, a.case_id);

  const mentorIds = Array.from(new Set(Array.from(pairs.values()).map((p) => p.mentorId)));
  const [users, payRows] = await Promise.all([
    fetchAllIn<{ id: string; name: string }>(mentorIds, (chunk, f, t) => admin.from('users').select('id, name').in('id', chunk).range(f, t)),
    kind === 'mentor'
      ? fetchAllIn<{ mentor_id: string; file_name: string; storage_path: string; mime_type: string | null; sort_order: number; created_at: string }>(mentorIds, (chunk, f, t) =>
          admin.from('mentor_payment_files').select('mentor_id, file_name, storage_path, mime_type, sort_order, created_at').eq('program_id', programId).in('mentor_id', chunk).range(f, t),
        )
      : Promise.resolve([]),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const docByKey = new Map(docs.filter((d) => d.doc_key.startsWith('mentoring_report:')).map((d) => [d.doc_key, d]));
  const obsByCase = new Map(docs.filter((d) => d.doc_key === 'observation_report').map((d) => [d.case_id, d]));
  const lastMentor = new Map<string, string>();
  for (const a of [...assigns].sort((x, y) => Number(x.is_active) - Number(y.is_active) || (x.assigned_at ?? '').localeCompare(y.assigned_at ?? ''))) lastMentor.set(a.case_id, a.mentor_id);

  const logsByCase = new Map<string, typeof logs>();
  for (const l of logs) (logsByCase.get(l.case_id) ?? logsByCase.set(l.case_id, []).get(l.case_id)!).push(l);

  // 서명 URL 은 마지막에 한 번에 (100개씩) — 부품마다 스토리지 경로를 기억해 둔다
  const pathOf = new Map<PackagePart, string>();
  const mkPart = (label: string, sourceName: string, mime: string | null, storagePath: string): PackagePart => {
    const part: PackagePart = { label, sourceName, kind: partKindOf(sourceName, mime), url: '' };
    pathOf.set(part, storagePath);
    return part;
  };

  /** 쌍 하나의 합본 구성 — 파일이 하나도 없으면 null */
  const pairDoc = (p: Pair): PackageDoc | null => {
    const c = caseById.get(p.caseId)!;
    const parts: PackageDoc['parts'] = [];
    for (const l of (logsByCase.get(p.caseId) ?? []).filter((x) => x.mentor_id === p.mentorId && x.report_registered_at).sort((a, b) => a.round_no - b.round_no)) {
      const d = docByKey.get(reportDocKey(l.id));
      if (d) parts.push(mkPart(`${l.round_no}회차 보고서`, d.doc_name || d.storage_path, d.mime_type, d.storage_path));
    }
    const obs = obsByCase.get(p.caseId);
    const obsMentor = obs ? (obs.uploaded_by && nameOf.has(obs.uploaded_by) ? obs.uploaded_by : lastMentor.get(p.caseId)) : null;
    const withObs = !!obs && obsMentor === p.mentorId;
    if (obs && withObs) parts.push(mkPart('결과보고서', obs.doc_name || obs.storage_path, obs.mime_type, obs.storage_path));
    if (parts.length === 0) return null;
    return { name: pairPdfName(nameOf.get(p.mentorId) ?? '멘토', c.owner_name, withObs), parts };
  };

  const notes: string[] = [];
  let folders: PackageFolder[] = [];
  if (kind === 'mentor') {
    const ordered = mentorIds.slice().sort((a, b) => (nameOf.get(a) ?? '').localeCompare(nameOf.get(b) ?? '', 'ko'));
    const folderNames = dedupeNames(ordered.map((id) => cleanName(nameOf.get(id), '멘토')));
    const noPay: string[] = [];
    const noReport: string[] = [];
    folders = ordered.map((mentorId, i) => {
      const name = nameOf.get(mentorId) ?? '멘토';
      const docsOut: PackageDoc[] = [];
      const pay = payRows.filter((r) => r.mentor_id === mentorId).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
      if (pay.length) {
        docsOut.push({ name: paymentPdfName(name), parts: pay.map((r) => mkPart(r.file_name.replace(/\.[^.]+$/, ''), r.file_name, r.mime_type, r.storage_path)) });
      } else noPay.push(name);
      const myPairs = Array.from(pairs.values())
        .filter((p) => p.mentorId === mentorId)
        .sort((a, b) => (caseById.get(a.caseId)?.owner_name ?? '').localeCompare(caseById.get(b.caseId)?.owner_name ?? '', 'ko'));
      let reports = 0;
      for (const p of myPairs) {
        const d = pairDoc(p);
        if (d) {
          docsOut.push(d);
          reports += 1;
        }
      }
      if (reports === 0) noReport.push(name);
      return { folder: folderNames[i]!, docs: docsOut };
    });
    if (noPay.length) notes.push(`지급서류(파일 관리 > 멘토 지급서류)가 없는 멘토 ${noPay.length}명: ${noPay.join(', ')}`);
    if (noReport.length) notes.push(`등록된 보고서가 없는 멘토 ${noReport.length}명(폴더에 지급서류만): ${noReport.join(', ')}`);
  } else {
    const ext = new Map(profiles.map((p) => [p.case_id, p.external_no]));
    const withPair = new Set(Array.from(pairs.values()).map((p) => p.caseId));
    const unassigned = cases.filter((c) => !withPair.has(c.id)).length;
    const ordered = cases.filter((c) => withPair.has(c.id)).sort((a, b) => compareExternalNo(ext.get(a.id), ext.get(b.id)) || a.owner_name.localeCompare(b.owner_name, 'ko'));
    const empty: string[] = [];
    folders = ordered.map((c, i) => {
      const myPairs = Array.from(pairs.values())
        .filter((p) => p.caseId === c.id)
        .sort((a, b) => (nameOf.get(a.mentorId) ?? '').localeCompare(nameOf.get(b.mentorId) ?? '', 'ko'));
      const docsOut = myPairs.map(pairDoc).filter((d): d is PackageDoc => d !== null);
      const folder = menteeFolderName(i + 1, ordered.length, c.owner_name);
      if (docsOut.length === 0) empty.push(folder);
      return { folder, docs: docsOut };
    });
    if (unassigned) notes.push(`멘토가 배정된 적 없는 멘티 ${unassigned}명은 폴더를 만들지 않았습니다.`);
    if (empty.length) notes.push(`보고서가 아직 없어 빈 폴더인 멘티 ${empty.length}명: ${empty.join(', ')}`);
    notes.push('번호 순서 = 멘티 고유번호(없으면 이름 가나다순).');
  }

  // 서명 URL 채우기
  const allParts = Array.from(pathOf.keys());
  for (let i = 0; i < allParts.length; i += 100) {
    const chunk = allParts.slice(i, i + 100);
    const { data, error } = await admin.storage.from('documents').createSignedUrls(chunk.map((part) => pathOf.get(part)!), URL_TTL);
    if (error) return { ok: false, error: `파일 주소를 만들지 못했습니다: ${error.message}` };
    chunk.forEach((part, idx) => (part.url = data?.[idx]?.signedUrl ?? ''));
  }

  return {
    ok: true,
    fileCount: allParts.length,
    manifest: { kind, groupName: group.name, zipName: `${kind === 'mentor' ? MENTOR_PACKAGE_NAME : MENTEE_PACKAGE_NAME}.zip`, folders, notes },
  };
}
