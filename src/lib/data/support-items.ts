import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getSessionProfile, getRealSessionProfile } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCaseScopedSignedUrl } from '@/lib/storage/files';
import { parseItemDocKey, decodeContractorSigner } from '@/lib/support/catalog';

export type SupportRole = 'mentee' | 'mentor' | 'nextlab' | 'institution';

export interface SupportContext {
  caseId: string;
  businessName: string;
  supportTypeName: string | null;
  supportTypeCode: string | null;
  limitAmount: number;
  actorId: string;
  role: SupportRole;
  /** 멘티 본인·담당 멘토는 편집 가능. 운영기관은 열람 위주(편집 허용). */
  editable: boolean;
}

/**
 * 지원신청/자금신청/공사업체 서명 화면의 접근 권한 검증 + 케이스 컨텍스트 반환.
 *  - 멘티: 본인 케이스만
 *  - 멘토: 활성 배정된 케이스만 (대리 업로드)
 *  - 넥스트랩·진흥원: 열람/보조
 * 권한 없으면 null.
 */
export async function getSupportContext(caseId: string): Promise<SupportContext | null> {
  const profile = await getSessionProfile();
  const real = await getRealSessionProfile();
  if (!profile || !profile.is_active) return null;

  const admin = createAdminClient();
  const { data: c } = await admin
    .from('cases')
    .select('id, business_name, mentee_id, support_type_id')
    .eq('id', caseId)
    .maybeSingle();
  if (!c) return null;

  let role: SupportRole;
  if (profile.role === 'mentee') {
    if (c.mentee_id !== profile.id) return null;
    role = 'mentee';
  } else if (profile.role === 'mentor') {
    const { data: assign } = await admin
      .from('mentor_assignments')
      .select('id')
      .eq('case_id', caseId)
      .eq('mentor_id', profile.id)
      .eq('is_active', true)
      .maybeSingle();
    if (assign) {
      role = 'mentor';
    } else if (real && real.is_active && (real.role === 'nextlab' || real.role === 'institution')) {
      // 대행 중이지만 그 멘토에게 배정되지 않은 케이스 → 실제 신원(스태프) 열람으로 폴백.
      // 대행 때문에 넥스트랩이 자기 콘솔에서 멘티 서류를 못 보게 되는 일을 막는다.
      role = real.role;
    } else {
      return null;
    }
  } else if (profile.role === 'nextlab' || profile.role === 'institution') {
    role = profile.role;
  } else {
    return null;
  }

  const { data: st } = await admin
    .from('support_types')
    .select('name, code, limit_amount')
    .eq('id', c.support_type_id)
    .maybeSingle();

  return {
    caseId,
    businessName: c.business_name,
    supportTypeName: st?.name ?? null,
    supportTypeCode: st?.code ?? null,
    limitAmount: Number(st?.limit_amount ?? 0),
    actorId: profile.id,
    role,
    editable: role === 'mentee' || role === 'mentor',
  };
}

export interface SupportDocFile {
  id: string;
  docType: string;
  docName: string;
  createdAt: string;
}

export interface SupportItem {
  id: string;
  companyName: string;
  representative: string | null;
  workType: string | null;
  businessRegNo: string | null;
  phone: string | null;
  estimateAmount: number | null;
  docs: SupportDocFile[];
}

/** 신청단위(공사업체) 목록 + 각 단위의 첨부서류 (권한 검증 후 호출 전제) */
export async function listSupportItems(caseId: string): Promise<SupportItem[]> {
  const admin = createAdminClient();
  const { data: contractors } = await admin
    .from('contractors')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  const items = contractors ?? [];
  if (items.length === 0) return [];

  const { data: docs } = await (admin as unknown as SupabaseClient)
    .from('documents')
    .select('id, doc_key, doc_name, created_at')
    .eq('case_id', caseId)
    .like('doc_key', 'si:%')
    .order('created_at', { ascending: true });

  const docsByContractor = new Map<string, SupportDocFile[]>();
  for (const d of (docs ?? []) as {
    id: string;
    doc_key: string;
    doc_name: string;
    created_at: string;
  }[]) {
    const parsed = parseItemDocKey(d.doc_key);
    if (!parsed) continue;
    const list = docsByContractor.get(parsed.contractorId) ?? [];
    list.push({ id: d.id, docType: parsed.docType, docName: d.doc_name, createdAt: d.created_at });
    docsByContractor.set(parsed.contractorId, list);
  }

  return items.map((it) => ({
    id: it.id,
    companyName: it.company_name,
    representative: it.representative,
    workType: it.work_type,
    businessRegNo: it.business_reg_no,
    phone: it.phone,
    estimateAmount: it.estimate_amount != null ? Number(it.estimate_amount) : null,
    docs: docsByContractor.get(it.id) ?? [],
  }));
}

/** 자금신청(사후) 지급증빙 서류 목록 (post:* doc_key) */
export async function listPostSupportDocs(caseId: string): Promise<SupportDocFile[]> {
  const admin = createAdminClient();
  const { data } = await (admin as unknown as SupabaseClient)
    .from('documents')
    .select('id, doc_key, doc_name, created_at')
    .eq('case_id', caseId)
    .like('doc_key', 'post:%')
    .order('created_at', { ascending: true });
  return ((data ?? []) as { id: string; doc_key: string; doc_name: string; created_at: string }[]).map(
    (d) => ({
      id: d.id,
      docType: (d.doc_key.split(':')[1] ?? ''),
      docName: d.doc_name,
      createdAt: d.created_at,
    }),
  );
}

export interface ContractorSignatureItem {
  id: string;
  companyName: string;
  representative: string;
  createdAt: string;
  /** 저장된 서명 이미지 열람용 signed URL (없으면 null) */
  imageUrl: string | null;
}

/** 공사업체 서명 목록 (signatures: signer_type='contractor', document_type='contractor_sign') */
export async function listContractorSignatures(
  caseId: string,
): Promise<ContractorSignatureItem[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('signatures')
    .select('id, signer_name, created_at, storage_path')
    .eq('case_id', caseId)
    .eq('document_type', 'contractor_sign')
    .order('created_at', { ascending: true });

  return Promise.all(
    (data ?? []).map(async (s) => {
      const { company, rep } = decodeContractorSigner(s.signer_name);
      const imageUrl = s.storage_path
        ? await createCaseScopedSignedUrl('signatures', caseId, s.storage_path, 3600)
        : null;
      return {
        id: s.id,
        companyName: company,
        representative: rep,
        createdAt: s.created_at,
        imageUrl,
      };
    }),
  );
}
