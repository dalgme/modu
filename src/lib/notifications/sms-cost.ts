/**
 * 문자 발송 비용 계산 (클라이언트·서버 공용, server-only 아님).
 * 요율은 Solapi 표준(부가세 별도) 기본값이며 환경변수로 조정 가능하다.
 *  - SMS(단문, ≤90byte): 기본 9원
 *  - LMS(장문, >90byte): 기본 30원
 * 실시간 미리보기용이므로 실제 청구액과 소폭 차이가 있을 수 있다(할인/부가세 등).
 */
export const SMS_UNIT_PRICE = Number(process.env.NEXT_PUBLIC_SMS_PRICE_SMS ?? 9);
export const LMS_UNIT_PRICE = Number(process.env.NEXT_PUBLIC_SMS_PRICE_LMS ?? 30);

/** 한글 2byte 기준 바이트 길이 (SMS/LMS 판정) */
export function smsByteLength(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return n;
}

export type SmsKind = 'SMS' | 'LMS';

/** 90byte 초과 시 LMS */
export function smsKind(text: string): SmsKind {
  return smsByteLength(text) > 90 ? 'LMS' : 'SMS';
}

export function smsUnitPrice(text: string): number {
  return smsKind(text) === 'LMS' ? LMS_UNIT_PRICE : SMS_UNIT_PRICE;
}

export interface SmsCost {
  kind: SmsKind;
  bytes: number;
  unitPrice: number;
  recipientCount: number;
  total: number;
}

/** 메시지·수신자 수 → 발송 비용 견적 */
export function estimateSmsCost(text: string, recipientCount: number): SmsCost {
  const kind = smsKind(text);
  const unitPrice = kind === 'LMS' ? LMS_UNIT_PRICE : SMS_UNIT_PRICE;
  return {
    kind,
    bytes: smsByteLength(text),
    unitPrice,
    recipientCount,
    total: unitPrice * recipientCount,
  };
}
