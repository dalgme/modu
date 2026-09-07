/**
 * 지급(지원금)신청서 관련 서류 doc_key 정의 — 폐업 정리 지원금신청 단계에서
 * 멘토·멘티기업·넥스트랩이 각각 업로드한다.
 *  - payment_application_file      지급(지원금)신청서 본문
 *  - pledge_no_overlap_file        사업참여 및 중복지원 금지 확약서
 *  - payment_construction_detail   공사내역서
 *  - payment_tax_invoice           전자세금계산서
 *  - payment_transfer_proof        계좌이체 임금증(또는 이체(송금)확인증)
 *  - payment_bankbook              통장사본(대표자 명의)
 *  - payment_contractor_biz_reg    외주업체 사업자등록증 사본
 */
export const PAYMENT_DOC_KEYS = [
  'payment_application_file',
  'pledge_no_overlap_file',
  'payment_construction_detail',
  'payment_tax_invoice',
  'payment_transfer_proof',
  'payment_bankbook',
  'payment_contractor_biz_reg',
] as const;

export type PaymentDocKey = (typeof PAYMENT_DOC_KEYS)[number];

export function isPaymentDocKey(docKey: string): docKey is PaymentDocKey {
  return (PAYMENT_DOC_KEYS as readonly string[]).includes(docKey);
}

export interface PaymentDocSlot {
  key: PaymentDocKey;
  label: string;
  multiple?: boolean;
  hint?: string;
}

/** 지원금신청서 단계 서류 (지원금신청서 + 확약서) */
export const PAYMENT_APPLICATION_SLOTS: PaymentDocSlot[] = [
  { key: 'payment_application_file', label: '지원금(지급)신청서', multiple: false },
  { key: 'pledge_no_overlap_file', label: '사업참여 및 중복지원 금지 확약서' },
];

/** 지급 증빙서류 단계 서류 */
export const PAYMENT_EVIDENCE_SLOTS: PaymentDocSlot[] = [
  { key: 'payment_construction_detail', label: '공사내역서' },
  { key: 'payment_tax_invoice', label: '전자세금계산서' },
  { key: 'payment_transfer_proof', label: '계좌이체 임금증(또는 이체(송금)확인증)' },
  { key: 'payment_bankbook', label: '통장사본(대표자 명의)' },
  { key: 'payment_contractor_biz_reg', label: '외주업체 사업자등록증 사본' },
];
