/**
 * 문자 발송 결과 상태 (2026-11-03) — 서버·클라이언트 공용 중립 파일.
 * 솔라피 statusCode: 2000 = 정상 접수 · 3000 = 이통사 접수(전송 중) · 4000 = 수신 완료 · 그 밖의 코드 = 실패.
 */
export type SmsItemStatus = 'rejected' | 'pending' | 'delivered' | 'failed';

export const SMS_ITEM_STATUS_LABELS: Record<SmsItemStatus, string> = {
  rejected: '접수 실패',
  pending: '전송 중',
  delivered: '수신 완료',
  failed: '수신 실패',
};

/** 다시 보낼 대상인가 (접수 실패 + 수신 실패) */
export function isRetryable(status: string): boolean {
  return status === 'rejected' || status === 'failed';
}

/** 솔라피 조회 결과 → 우리 상태 */
export function classifySolapiStatus(statusCode: string | null | undefined, status?: string | null): Exclude<SmsItemStatus, 'rejected'> {
  const code = (statusCode ?? '').trim();
  if (code === '4000') return 'delivered';
  if (code === '' || code === '2000' || code === '3000') {
    if ((status ?? '').toUpperCase() === 'FAILED') return 'failed';
    return 'pending';
  }
  return 'failed';
}

/** 실패 사유를 쉬운 말로 (솔라피 사유 문구가 있으면 그대로 붙인다) */
export function describeSmsReason(statusCode: string | null | undefined, reason: string | null | undefined): string {
  const r = (reason ?? '').trim();
  const code = (statusCode ?? '').trim();
  if (code === '429' || /toomanyrequests/i.test(r)) return '발송 요청이 너무 몰려 솔라피가 거부함 (예전 일괄 발송 방식의 한도 초과) — 다시 보내면 됩니다';
  if (/balance|잔액/i.test(r)) return `솔라피 잔액 부족${r ? ` (${r})` : ''}`;
  if (/sender|발신번호/i.test(r)) return `발신번호 문제${r ? ` (${r})` : ''}`;
  if (r) return code ? `${r} (코드 ${code})` : r;
  return code ? `코드 ${code}` : '';
}

export interface SmsBatchCounts {
  total: number;
  rejected: number;
  pending: number;
  delivered: number;
  failed: number;
}

export function countStatuses(statuses: string[]): SmsBatchCounts {
  const c: SmsBatchCounts = { total: statuses.length, rejected: 0, pending: 0, delivered: 0, failed: 0 };
  for (const s of statuses) if (s === 'rejected' || s === 'pending' || s === 'delivered' || s === 'failed') c[s] += 1;
  return c;
}
