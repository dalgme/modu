import { pickRateRow, type RateRowLike } from '@/lib/settlement/rate-pick';
import { roundAmount } from '@/lib/settlement/round-amount';

/**
 * 미정산 회차 단가 재적용 계획 (2026-11-02) — 순수 함수(서버·테스트 공용).
 * 회차는 등록 시점의 단가를 스냅샷으로 들고 있어서, 운영사가 단가를 바꿔도(특히 지난 적용일로 소급) 이미 등록된 회차는
 * 옛 단가로 남았다(1기 2라운드 온라인 80,000/100,000 혼용). 정산 확정(settlement_id) 전 회차는 아직 '예상' 금액이므로
 * 회차 일자(KST) 기준으로 지금 단가 표를 다시 적용한다. 정산에 들어간 회차는 절대 건드리지 않는다.
 */
export interface RepriceLog {
  id: string;
  caseId: string;
  groupId: string;
  mode: string;
  startedAt: string;
  endedAt: string;
  unitPrice: number;
  amount: number;
  rateId: string | null;
  settled: boolean;
  /** 그룹멘토링에서 수당 대표가 아닌 참여 회차 — 세션 1회분은 대표 회차만 갖으므로 0원 유지 (2026-11-04) */
  feeZero?: boolean;
}

export interface RepriceChange {
  logId: string;
  caseId: string;
  groupId: string;
  mode: string;
  day: string;
  fromPrice: number;
  toPrice: number;
  fromAmount: number;
  toAmount: number;
  rateId: string;
}

/** KST 날짜(YYYY-MM-DD) */
export function kstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function planReprice(logs: RepriceLog[], rates: RateRowLike[], opts: { groupId?: string | null; mode?: string | null; fromDate?: string | null } = {}): RepriceChange[] {
  const out: RepriceChange[] = [];
  for (const l of logs) {
    if (l.settled) continue;
    if (opts.groupId && l.groupId !== opts.groupId) continue;
    if (opts.mode && l.mode !== opts.mode) continue;
    if (l.feeZero && Number(l.amount) === 0 && Number(l.unitPrice) === 0) continue; // 그룹 비대표 회차 — 이미 0원
    const day = kstDay(l.startedAt);
    if (opts.fromDate && day < opts.fromDate) continue;
    const rate = pickRateRow(rates, l.groupId, l.mode, day);
    if (!rate) continue; // 그 날짜에 단가가 없으면 그대로 둔다
    const toPrice = l.feeZero ? 0 : Number(rate.unit_price);
    const toAmount = l.feeZero ? 0 : roundAmount(toPrice, l.startedAt, l.endedAt);
    if (toPrice === Number(l.unitPrice) && toAmount === Number(l.amount) && rate.id === l.rateId) continue;
    out.push({ logId: l.id, caseId: l.caseId, groupId: l.groupId, mode: l.mode, day, fromPrice: Number(l.unitPrice), toPrice, fromAmount: Number(l.amount), toAmount, rateId: rate.id });
  }
  return out;
}
