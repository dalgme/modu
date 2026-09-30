import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { buildDownloadName } from '@/lib/files/download-name-rule';

type DocRow = { id: string; doc_key: string; doc_name: string; storage_path: string; uploaded_by: string | null; created_at: string };

/** 같은 구분이 여러 개일 때 번호를 매길 묶음 키 */
function seqGroup(docKey: string): string | null {
  if (docKey.startsWith('mentoring_photo:')) return docKey;
  if (docKey === 'business_plan' || docKey === 'business_ref' || docKey === 'case_doc' || docKey === 'application_pdf') return docKey;
  if (docKey.startsWith('req')) return docKey;
  return null;
}

/**
 * 케이스 서류의 다운로드 파일명 (2026-09-30) — `download-name-rule.ts` 규칙을 실제 이름으로 채운다.
 * 멘토 = 회차 보고서·사진은 그 회차를 진행한 멘토, 관찰의견서는 올린 멘토(모르면 현재 담당), 정산서는 그 정산의 멘토.
 * 반환: 문서 id → 파일명. 조회 권한 확인은 호출부 몫(서비스롤 조회).
 */
export async function downloadNamesForCase(caseId: string): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const [{ data: c }, { data: docs }, { data: logs }, { data: assigns }, { data: settles }] = await Promise.all([
    admin.from('cases').select('owner_name, support_type_id').eq('id', caseId).maybeSingle(),
    admin.from('documents').select('id, doc_key, doc_name, storage_path, uploaded_by, created_at').eq('case_id', caseId).order('created_at'),
    admin.from('mentoring_logs').select('id, round_no, mentor_id').eq('case_id', caseId),
    admin.from('mentor_assignments').select('mentor_id, is_active, assigned_at').eq('case_id', caseId).order('assigned_at', { ascending: false }),
    admin.from('settlements').select('id, mentor_id').eq('case_id', caseId),
  ]);
  const out = new Map<string, string>();
  if (!c || !docs) return out;

  const { data: reqDefs } = c.support_type_id
    ? await admin.from('support_type_documents').select('doc_key, doc_name').eq('support_type_id', c.support_type_id)
    : { data: [] as { doc_key: string; doc_name: string }[] };
  const reqLabel = new Map((reqDefs ?? []).map((d) => [d.doc_key, d.doc_name]));

  const mentorIds = new Set<string>([...(logs ?? []).map((l) => l.mentor_id), ...(assigns ?? []).map((a) => a.mentor_id), ...(settles ?? []).map((s) => s.mentor_id)].filter(Boolean) as string[]);
  const { data: users } = mentorIds.size ? await admin.from('users').select('id, name').in('id', Array.from(mentorIds)) : { data: [] as { id: string; name: string }[] };
  const nameOf = new Map((users ?? []).map((u) => [u.id, u.name]));
  const currentMentor = (assigns ?? []).find((a) => a.is_active)?.mentor_id ?? assigns?.[0]?.mentor_id ?? null;
  const logById = new Map((logs ?? []).map((l) => [l.id, l]));
  const settleMentor = new Map((settles ?? []).map((s) => [s.id, s.mentor_id]));

  // 같은 구분 번호
  const groups = new Map<string, DocRow[]>();
  for (const d of docs as DocRow[]) {
    const g = seqGroup(d.doc_key);
    if (!g) continue;
    groups.set(g, [...(groups.get(g) ?? []), d]);
  }
  const seqOf = (d: DocRow): number | null => {
    const g = seqGroup(d.doc_key);
    const list = g ? groups.get(g) ?? [] : [];
    return list.length > 1 ? list.findIndex((x) => x.id === d.id) + 1 : null;
  };

  for (const d of docs as DocRow[]) {
    const logId = d.doc_key.includes(':') && (d.doc_key.startsWith('mentoring_report:') || d.doc_key.startsWith('mentoring_photo:')) ? d.doc_key.split(':')[1]! : null;
    const log = logId ? logById.get(logId) : undefined;
    let mentorId: string | null = null;
    if (log) mentorId = log.mentor_id;
    else if (d.doc_key === 'observation_report') mentorId = d.uploaded_by && mentorIds.has(d.uploaded_by) ? d.uploaded_by : currentMentor;
    else if (d.doc_key.startsWith('settlement_statement')) mentorId = settleMentor.get(d.doc_key.split(':')[1] ?? '') ?? currentMentor;
    const reqKey = d.doc_key.startsWith('req') ? d.doc_key.slice(d.doc_key.indexOf(':') + 1) : null;
    out.set(
      d.id,
      buildDownloadName({
        docKey: d.doc_key,
        sourceName: d.doc_name || d.storage_path,
        menteeName: c.owner_name,
        mentorName: mentorId ? nameOf.get(mentorId) ?? null : null,
        roundNo: log?.round_no ?? null,
        label: reqKey ? reqLabel.get(reqKey) ?? null : null,
        seq: seqOf(d),
      }),
    );
    // 저장 경로에만 확장자가 있는 경우 보정
    const name = out.get(d.id)!;
    if (!/\.[a-z0-9]{1,5}$/.test(name)) {
      const ext = /\.([A-Za-z0-9]{1,5})$/.exec(d.storage_path)?.[1];
      if (ext) out.set(d.id, `${name}.${ext.toLowerCase()}`);
    }
  }
  return out;
}

/** 문서 1건의 다운로드 파일명 (없으면 저장된 이름) */
export async function downloadNameForDoc(caseId: string, docId: string, fallback: string): Promise<string> {
  try {
    return (await downloadNamesForCase(caseId)).get(docId) ?? fallback;
  } catch (e) {
    console.error('downloadNameForDoc failed:', e instanceof Error ? e.message : e);
    return fallback;
  }
}
