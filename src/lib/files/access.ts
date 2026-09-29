import 'server-only';

import { getSessionProfile, realRoleOrNull, roleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 업로드 파일 1건 접근 판정 (2026-09-30) — 미리보기·다운로드 라우트(`/api/files/doc/[id]`) 공용.
 * RLS 에 기대지 않고 코드에서 직접 확인한다(CLAUDE.md §6-2).
 *  - 발주처·운영사: 컨텍스트 행사의 케이스 서류 전부 (대행 중이면 실행자 기준 — 실행자가 이 행사 스태프)
 *  - 멘토: 그 케이스에 배정된 적이 있거나 회차를 진행한 멘토. 멘토 비공개 멘티 서류(case_doc, mentor_visible=false)는 제외
 *  - 멘티: 본인 케이스의 회차 보고서·사진·필수서류·본인이 올린 서류 (관찰의견서·정산서는 제외)
 */
export interface DocFile {
  id: string;
  caseId: string;
  bucket: 'documents' | 'photos';
  path: string;
  name: string;
  mime: string | null;
}

export type DocAccess = { ok: true; doc: DocFile; viewerId: string } | { ok: false; status: 401 | 403 | 404 };

export async function resolveDocAccess(docId: string): Promise<DocAccess> {
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return { ok: false, status: 404 };
  const admin = createAdminClient();
  const { data: d } = await admin
    .from('documents')
    .select('id, case_id, doc_key, doc_name, storage_path, mime_type, mentor_visible, uploaded_by, cases!inner(program_id, mentee_id)')
    .eq('id', docId)
    .maybeSingle();
  if (!d || !d.case_id) return { ok: false, status: 404 };
  const c = d.cases as unknown as { program_id: string; mentee_id: string | null };
  const doc: DocFile = {
    id: d.id,
    caseId: d.case_id,
    bucket: d.doc_key.startsWith('mentoring_photo:') ? 'photos' : 'documents',
    path: d.storage_path,
    name: d.doc_name,
    mime: d.mime_type,
  };

  // 스태프 (실제 신원 · 2단계 인증 통과) — 컨텍스트 행사의 케이스만
  const staff = await realRoleOrNull(['nextlab', 'institution']);
  if (staff) {
    const ctx = await contextOrNull(staff);
    if (ctx && ctx.programId === c.program_id) return { ok: true, doc, viewerId: staff.id };
  }

  const me = await roleOrNull(['mentor', 'mentee']);
  if (!me) return (await getSessionProfile()) ? { ok: false, status: 403 } : { ok: false, status: 401 };

  if (me.role === 'mentor') {
    if (d.doc_key === 'case_doc' && !d.mentor_visible) return { ok: false, status: 403 };
    const [{ count: assigned }, { count: ran }] = await Promise.all([
      admin.from('mentor_assignments').select('id', { count: 'exact', head: true }).eq('case_id', d.case_id).eq('mentor_id', me.id),
      admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', d.case_id).eq('mentor_id', me.id),
    ]);
    return (assigned ?? 0) + (ran ?? 0) > 0 ? { ok: true, doc, viewerId: me.id } : { ok: false, status: 403 };
  }

  // 멘티 — 본인 케이스만
  if (c.mentee_id !== me.id) return { ok: false, status: 403 };
  const menteeVisible =
    d.uploaded_by === me.id ||
    d.doc_key.startsWith('mentoring_report:') ||
    d.doc_key.startsWith('mentoring_photo:') ||
    d.doc_key.startsWith('req');
  return menteeVisible ? { ok: true, doc, viewerId: me.id } : { ok: false, status: 403 };
}
