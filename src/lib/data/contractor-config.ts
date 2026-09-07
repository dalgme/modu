import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { setSetting } from '@/lib/data/app-settings';

/** 공사업체 구성 (케이스별). 예산 범위 안에서 1~여러 업체와 진행 가능. */
export interface ContractorConfig {
  /** 업체 수 (1~) */
  companyCount: number;
  /** 간판(옥외광고) 공사업체 포함 여부 */
  signageIncluded: boolean;
  /** 간판업체로 지정된 업체 번호 (1-based). signageIncluded=false 면 null */
  signageCompanyIndex: number | null;
}

const settingKey = (caseId: string) => `contractor_config:${caseId}`;

export async function getContractorConfig(caseId: string): Promise<ContractorConfig | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', settingKey(caseId))
    .maybeSingle();
  if (!data?.value) return null;
  try {
    const c = JSON.parse(data.value) as ContractorConfig;
    if (!c || typeof c.companyCount !== 'number' || c.companyCount < 1) return null;
    return {
      companyCount: Math.min(Math.max(Math.floor(c.companyCount), 1), 10),
      signageIncluded: !!c.signageIncluded,
      signageCompanyIndex: c.signageIncluded ? (c.signageCompanyIndex ?? null) : null,
    };
  } catch {
    return null;
  }
}

export async function saveContractorConfig(
  caseId: string,
  config: ContractorConfig,
  updatedBy?: string | null,
): Promise<void> {
  await setSetting(settingKey(caseId), JSON.stringify(config), updatedBy);
}

export interface ContractorDocSpec {
  key: string;
  label: string;
  required: boolean;
}

/** 업체 i(1-based)의 서류 스펙 (필수 3종 + 간판업체면 옥외광고업등록증) */
export function contractorDocSpecsForCompany(
  config: ContractorConfig,
  i: number,
): ContractorDocSpec[] {
  const specs: ContractorDocSpec[] = [
    { key: `contractor_estimate_${i}`, label: '견적서', required: true },
    { key: `contractor_estimate_compare_${i}`, label: '비교견적서', required: true },
    { key: `contractor_biz_reg_${i}`, label: '공급업체 사업자등록증', required: true },
  ];
  if (config.signageIncluded && config.signageCompanyIndex === i) {
    specs.push({ key: `contractor_outdoor_ad_${i}`, label: '옥외광고업등록증', required: true });
  }
  return specs;
}

/** 모든 필수 doc_key 목록 */
export function contractorAllRequiredKeys(config: ContractorConfig): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= config.companyCount; i++) {
    for (const s of contractorDocSpecsForCompany(config, i)) if (s.required) keys.push(s.key);
  }
  return keys;
}

/** 업체 i(1-based)의 필수 doc_key */
export function contractorCompanyRequiredKeys(config: ContractorConfig, i: number): string[] {
  return contractorDocSpecsForCompany(config, i)
    .filter((s) => s.required)
    .map((s) => s.key);
}

/** 필수 서류가 모두 업로드되었는지 */
export async function contractorDocsComplete(
  caseId: string,
  config: ContractorConfig | null,
): Promise<boolean> {
  if (!config) return false;
  const required = contractorAllRequiredKeys(config);
  if (required.length === 0) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from('documents')
    .select('doc_key')
    .eq('case_id', caseId)
    .in('doc_key', required);
  const present = new Set((data ?? []).map((d) => d.doc_key));
  return required.every((k) => present.has(k));
}

export interface ContractorCompanyStatus {
  index: number; // 1-based
  isSignage: boolean;
  done: boolean; // 해당 업체 필수 서류 완료
}

/** 업체별 완료 상태 목록 */
export async function contractorCompanyStatuses(
  caseId: string,
  config: ContractorConfig | null,
): Promise<ContractorCompanyStatus[]> {
  if (!config) return [];
  const admin = createAdminClient();
  const allKeys = contractorAllRequiredKeys(config);
  const { data } = await admin
    .from('documents')
    .select('doc_key')
    .eq('case_id', caseId)
    .in('doc_key', allKeys);
  const present = new Set((data ?? []).map((d) => d.doc_key));
  const out: ContractorCompanyStatus[] = [];
  for (let i = 1; i <= config.companyCount; i++) {
    const req = contractorCompanyRequiredKeys(config, i);
    out.push({
      index: i,
      isSignage: config.signageIncluded && config.signageCompanyIndex === i,
      done: req.length > 0 && req.every((k) => present.has(k)),
    });
  }
  return out;
}
