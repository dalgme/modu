import 'server-only';

import { convertedPdfMap } from '@/lib/converter/data';
import { withConvertedPdf } from '@/lib/converter/substitute';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { compareExternalNo, partKindOf } from '@/lib/files/round-package-shared';
import { observationZipBase, type ObservationBundleItem, type ObservationBundleManifest, type ObservationMode, type ObservationOrder } from '@/lib/files/observation-redact-shared';

/**
 * 라운드 관찰의견서 묶음 목록 (2026-11-17) — 관찰의견서만, 멘토별(멘토 이름 → 멘티 이름) 또는
 * 멘티별(고유번호 → 이름) 순서. 서버는 순서와 1시간 서명 URL 만 주고, 브라우저가 사본으로
 * "운영기관" 칸을 가린 PDF 를 만들어 한 폴더에 번호를 붙여 묶는다(원본은 그대로).
 * 관찰의견서의 멘토 = 올린 멘토(모르면 마지막 담당 멘토) — 제출용 묶음과 같은 규칙.
 */
const URL_TTL = 3600;

export async function buildObservationBundle(
  programId: string,
  groupId: string,
  order: ObservationOrder,
  mode: ObservationMode,
): Promise<{ ok: true; manifest: ObservationBundleManifest } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: group } = await admin.from('support_types').select('id, name, program_id').eq('id', groupId).maybeSingle();
  if (!group || group.program_id !== programId) return { ok: false, error: '이 행사의 라운드(사업그룹)가 아닙니다.' };

  const cases = await fetchAll<{ id: string; owner_name: string }>((f, t) => admin.from('cases').select('id, owner_name').eq('program_id', programId).eq('support_type_id', groupId).range(f, t));
  if (cases.length === 0) return { ok: false, error: '이 라운드에 등록된 멘티가 없습니다.' };
  const caseIds = cases.map((c) => c.id);
  const [docs, assigns, profiles] = await Promise.all([
    fetchAllIn<{ id: string; case_id: string; doc_key: string; doc_name: string; storage_path: string; mime_type: string | null; uploaded_by: string | null }>(caseIds, (chunk, f, t) =>
      admin.from('documents').select('id, case_id, doc_key, doc_name, storage_path, mime_type, uploaded_by').in('case_id', chunk).eq('doc_key', 'observation_report').range(f, t),
    ),
    fetchAllIn<{ case_id: string; mentor_id: string; is_active: boolean; assigned_at: string }>(caseIds, (chunk, f, t) =>
      admin.from('mentor_assignments').select('case_id, mentor_id, is_active, assigned_at').in('case_id', chunk).range(f, t),
    ),
    fetchAllIn<{ case_id: string; external_no: string | null }>(caseIds, (chunk, f, t) => admin.from('mentee_profiles').select('case_id, external_no').in('case_id', chunk).range(f, t)),
  ]);
  if (docs.length === 0) return { ok: false, error: '이 라운드에 올라온 관찰의견서가 없습니다.' };

  const lastMentor = new Map<string, string>();
  for (const a of [...assigns].sort((x, y) => Number(x.is_active) - Number(y.is_active) || (x.assigned_at ?? '').localeCompare(y.assigned_at ?? ''))) lastMentor.set(a.case_id, a.mentor_id);
  const userIds = Array.from(new Set([...docs.map((d) => d.uploaded_by).filter((x): x is string => !!x), ...Array.from(lastMentor.values())]));
  const users = await fetchAllIn<{ id: string; name: string }>(userIds, (chunk, f, t) => admin.from('users').select('id, name').in('id', chunk).range(f, t));
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const mentorIds = new Set(assigns.map((a) => a.mentor_id));
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const ext = new Map(profiles.map((p) => [p.case_id, p.external_no]));

  const converted = await convertedPdfMap(docs);
  const rows = docs.map((raw) => {
    const d = withConvertedPdf(raw, converted.get(raw.id));
    const mentorId = d.uploaded_by && mentorIds.has(d.uploaded_by) ? d.uploaded_by : lastMentor.get(d.case_id) ?? null;
    const sourceName = d.doc_name || d.storage_path;
    return {
      caseId: d.case_id,
      path: d.storage_path,
      mentorName: (mentorId && nameOf.get(mentorId)) || '멘토',
      menteeName: caseById.get(d.case_id)?.owner_name ?? '멘티',
      sourceName,
      kind: ((k) => (k === 'pdf' || k === 'hwp' ? k : 'other'))(partKindOf(sourceName.includes('.') ? sourceName : d.storage_path, d.mime_type)) as ObservationBundleItem['kind'],
    };
  });
  rows.sort((a, b) =>
    order === 'mentor'
      ? a.mentorName.localeCompare(b.mentorName, 'ko') || a.menteeName.localeCompare(b.menteeName, 'ko')
      : compareExternalNo(ext.get(a.caseId), ext.get(b.caseId)) || a.menteeName.localeCompare(b.menteeName, 'ko'),
  );

  const urls: string[] = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { data, error } = await admin.storage.from('documents').createSignedUrls(chunk.map((r) => r.path), URL_TTL);
    if (error) return { ok: false, error: `파일 주소를 만들지 못했습니다: ${error.message}` };
    chunk.forEach((_, k) => urls.push(data?.[k]?.signedUrl ?? ''));
  }

  const withoutObs = cases.length - new Set(docs.map((d) => d.case_id)).size;
  const notes = [order === 'mentor' ? '번호 순서 = 멘토 이름 가나다순 → 멘티 이름순.' : '번호 순서 = 멘티 고유번호(없으면 이름 가나다순).'];
  if (withoutObs > 0) notes.push(`관찰의견서가 아직 없는 멘티 ${withoutObs}명은 빠졌습니다.`);
  return {
    ok: true,
    manifest: {
      order,
      mode,
      groupName: group.name,
      base: observationZipBase(group.name, order, mode),
      items: rows.map((r, i) => ({ mentorName: r.mentorName, menteeName: r.menteeName, sourceName: r.sourceName, kind: r.kind, url: urls[i] ?? '' })),
      notes,
    },
  };
}
