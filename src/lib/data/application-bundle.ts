import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

export interface BundleDoc {
  category: string;
  name: string;
  storagePath: string;
}

/** 파일명에 쓸 수 없는 문자 정리 */
function safeName(v: string): string {
  return (v || '파일').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
}

/**
 * 진흥원 일괄 다운로드용 '지원신청 서류' 묶음 목록.
 * 컨설팅 결과보고서 · 지원신청서(웹생성/파일첨부) · 멘티기업 사업자등록증 · 공사업체 서류들.
 * 카테고리 접두(01_ 등)로 zip 안에서 분류되도록 이름을 만든다.
 */
export async function listApplicationBundleDocs(caseId: string): Promise<BundleDoc[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('doc_key, doc_name, storage_path, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  const rows = data ?? [];

  const category = (docKey: string): string | null => {
    if (docKey === 'consulting_report') return '01_컨설팅결과보고서';
    if (docKey === 'support_application' || docKey === 'support_application_file')
      return '02_지원신청서';
    if (docKey === 'applicant_biz_reg') return '03_멘티기업_사업자등록증';
    if (docKey === 'form_pledge_no_overlap' || docKey === 'pledge_no_overlap_file')
      return '04_사업참여_중복지원금지_확약서';
    if (docKey.startsWith('contractor_') || docKey.startsWith('si:')) return '05_공사업체서류';
    return null;
  };

  const out: BundleDoc[] = [];
  for (const r of rows) {
    if (!r.doc_key || !r.storage_path) continue;
    const cat = category(r.doc_key);
    if (!cat) continue;
    out.push({ category: cat, name: safeName(r.doc_name ?? r.doc_key), storagePath: r.storage_path });
  }
  return out;
}
