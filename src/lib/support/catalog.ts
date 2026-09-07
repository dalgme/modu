/**
 * 지원신청(사전)·자금신청(사후) 서류 카탈로그 + 신청단위 조건 판정.
 * 클라이언트·서버 공용(순수 데이터/함수).
 */

/** 견적 비교견적서 요구 기준 금액 (이상이면 비교견적서 필요) */
export const COMPARE_ESTIMATE_THRESHOLD = 1_000_000;

/** 신청단위 최대 개수 */
export const MAX_SUPPORT_ITEMS = 3;

export type DocRequirement = 'always' | 'amount' | 'signage';

export interface DocSpec {
  docType: string;
  name: string;
  requirement: DocRequirement;
  multiple: boolean;
  hint?: string;
}

/** 지원신청(사전) — 신청단위별 서류 */
export const PRE_ITEM_DOCS: DocSpec[] = [
  { docType: 'biz_reg', name: '공사업체 사업자등록증', requirement: 'always', multiple: false },
  { docType: 'estimate', name: '견적서', requirement: 'always', multiple: false },
  {
    docType: 'compare_estimate',
    name: '비교견적서',
    requirement: 'amount',
    multiple: true,
    hint: '견적금액 100만원 이상이면 비교견적서가 필요합니다.',
  },
  {
    docType: 'outdoor_ad_permit',
    name: '옥외광고물 설치 허가서',
    requirement: 'signage',
    multiple: false,
    hint: '간판·옥외광고 관련 공사면 설치 허가서가 필요합니다.',
  },
];

/** 자금신청(사후) — 지급 증빙 서류 (케이스 단위) */
export const POST_DOCS: DocSpec[] = [
  { docType: 'tax_invoice', name: '세금계산서', requirement: 'always', multiple: false },
  { docType: 'transaction_statement', name: '거래명세서', requirement: 'always', multiple: false },
  {
    docType: 'transfer_confirm',
    name: '이체확인서(대금 지급 증빙)',
    requirement: 'always',
    multiple: false,
  },
  { docType: 'photo_before', name: '시공 전 사진', requirement: 'always', multiple: true },
  { docType: 'photo_after', name: '시공 후 사진', requirement: 'always', multiple: true },
];

/** 간판·옥외광고 관련 공사인지 (옥외광고 허가서 필요 판정) */
export function isSignageWork(workType: string | null | undefined): boolean {
  if (!workType) return false;
  return /간판|옥외|광고|사인|배너|현수막|전광판/.test(workType);
}

/** 신청단위 서류 중 현재 조건에서 필요한 서류만 반환 */
export function requiredItemDocs(amount: number | null, workType: string | null): DocSpec[] {
  return PRE_ITEM_DOCS.filter((d) => {
    if (d.requirement === 'amount') return (amount ?? 0) >= COMPARE_ESTIMATE_THRESHOLD;
    if (d.requirement === 'signage') return isSignageWork(workType);
    return true;
  });
}

/** documents.doc_key 규약 */
export function itemDocKey(contractorId: string, docType: string): string {
  return `si:${contractorId}:${docType}`;
}
export function postDocKey(docType: string): string {
  return `post:${docType}`;
}
export function parseItemDocKey(
  docKey: string,
): { contractorId: string; docType: string } | null {
  const parts = docKey.split(':');
  if (parts.length !== 3 || parts[0] !== 'si') return null;
  return { contractorId: parts[1]!, docType: parts[2]! };
}

/** 공사업체 서명 signer_name 인코딩(회사명|대표명) */
export function encodeContractorSigner(company: string, rep: string): string {
  return `${company}|${rep}`;
}
export function decodeContractorSigner(signerName: string | null): {
  company: string;
  rep: string;
} {
  const [company = '', rep = ''] = (signerName ?? '').split('|');
  return { company, rep };
}
