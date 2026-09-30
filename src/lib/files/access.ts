import 'server-only';

import { getSessionProfile, realRoleOrNull, roleOrNull } from '@/lib/auth/guards';
import { isBusinessDocKey } from '@/lib/files/business-plan-shared';
import { readFilePolicy } from '@/lib/files/policy';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 업로드 파일 1건 접근 판정 (2026-09-30) — 미리보기·다운로드 라우트(`/api/files/doc/[id]`) 공용.
 * RLS 에 기대지 않고 코드에서 직접 확인한다(CLAUDE.md §6-2).
 *  - 발주처·운영사: 컨텍스트 행사의 케이스 서류 전부 (대행 중이면 실행자 기준 — 실행자가 이 행사 스태프)
 *  - 멘토: 그 케이스에 배정된 적이 있거나 회차를 진행한 멘토. 멘토 비공개 멘티 서류(case_doc, mentor_visible=false)는 제외
 *  - 멘티: 본인 케이스의 회차 보고서·사진·필수서류·사업계획서/참고파일·본인이 올린 서류 (관찰의견서·정산서는 제외)
 *
 * downloadable (2026-09-30, 파일 보안 정책) — 다운로드·인쇄 허용 여부. false 면 웹 미리보기만(다운로드 라우트 403, 미리보기 창 인쇄 차단).
 *  - 발주처·운영사: 항상 true
 *  - 멘티 사업계획서·참고파일(doc_key business_plan/business_ref)을 멘토·멘티가 볼 때: 행사 설정
 *    programs.file_policy.business_plan_download 가 true 일 때만(기본 false = 미리보기만)
 *  - 그 밖에 볼 수 있는 파일: true
 */
export interface DocFile {
  id: string;
  caseId: string;
  bucket: 'documents' | 'photos';
  path: string;
  name: string;
  mime: string | null;
  docKey: string;
  programId: string;
}

export type DocAccess =
  | { ok: true; doc: DocFile; viewerId: string; downloadable: boolean }
  | { ok: false; status: 401 | 403 | 404 };

export async function resolveDocAccess(docId: string): Promise<DocAccess> {
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return { ok: false, status: 404 };
  const admin = createAdminClient();
  // documents → cases 외래키가 둘(case_id·copied_from_case_id, 0081)이라 `cases!inner(...)` 임베드는 모호해서
  // PostgREST 가 오류를 내고 모든 파일이 404 가 됐다(2026-09-30 장애) — 문서와 케이스를 따로 읽는다.
  const { data: d, error: docErr } = await admin
    .from('documents')
    .select('id, case_id, doc_key, doc_name, storage_path, mime_type, mentor_visible, uploaded_by')
    .eq('id', docId)
    .maybeSingle();
  if (docErr) console.error('resolveDocAccess document lookup failed:', docErr.message);
  if (!d || !d.case_id) return { ok: false, status: 404 };
  const { data: c, error: caseErr } = await admin.from('cases').select('program_id, mentee_id').eq('id', d.case_id).maybeSingle();
  if (caseErr) console.error('resolveDocAccess case lookup failed:', caseErr.message);
  if (!c) return { ok: false, status: 404 };
  const doc: DocFile = {
    id: d.id,
    caseId: d.case_id,
    bucket: d.doc_key.startsWith('mentoring_photo:') ? 'photos' : 'documents',
    path: d.storage_path,
    name: d.doc_name,
    mime: d.mime_type,
    docKey: d.doc_key,
    programId: c.program_id,
  };
  const business = isBusinessDocKey(d.doc_key);
  /** 멘토·멘티가 사업계획서·참고파일을 볼 때만 행사 정책을 읽는다 */
  const nonStaffDownloadable = async () => (business ? (await readFilePolicy(c.program_id)).businessPlanDownload : true);

  // 스태프 (실제 신원 · 2단계 인증 통과) — 컨텍스트 행사의 케이스만
  const staff = await realRoleOrNull(['nextlab', 'institution']);
  if (staff) {
    const ctx = await contextOrNull(staff);
    if (ctx && ctx.programId === c.program_id) return { ok: true, doc, viewerId: staff.id, downloadable: true };
  }

  const me = await roleOrNull(['mentor', 'mentee']);
  if (!me) return (await getSessionProfile()) ? { ok: false, status: 403 } : { ok: false, status: 401 };

  if (me.role === 'mentor') {
    if (d.doc_key === 'case_doc' && !d.mentor_visible) return { ok: false, status: 403 };
    const [{ count: assigned }, { count: ran }] = await Promise.all([
      admin.from('mentor_assignments').select('id', { count: 'exact', head: true }).eq('case_id', d.case_id).eq('mentor_id', me.id),
      admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', d.case_id).eq('mentor_id', me.id),
    ]);
    if ((assigned ?? 0) + (ran ?? 0) === 0) return { ok: false, status: 403 };
    return { ok: true, doc, viewerId: me.id, downloadable: await nonStaffDownloadable() };
  }

  // 멘티 — 본인 케이스만
  if (c.mentee_id !== me.id) return { ok: false, status: 403 };
  const menteeVisible =
    d.uploaded_by === me.id ||
    d.doc_key.startsWith('mentoring_report:') ||
    d.doc_key.startsWith('mentoring_photo:') ||
    d.doc_key.startsWith('req') ||
    business;
  if (!menteeVisible) return { ok: false, status: 403 };
  return { ok: true, doc, viewerId: me.id, downloadable: await nonStaffDownloadable() };
}
