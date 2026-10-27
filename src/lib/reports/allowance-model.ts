/**
 * 멘토링 수당 산출내역 엑셀 (2026-10-27) — 계산 규칙. 서버·테스트 공용 순수 함수.
 *
 * 엑셀 안의 수식과 같은 계산을 TS 로도 해서, 수식 칸에 결과값을 함께 저장한다
 * (미리보기·모바일 뷰어처럼 수식을 다시 계산하지 않는 곳에서도 숫자가 보이게).
 * 세금은 창경 산출 방식대로 **멘토별 수당 합계**에 원천징수 규칙을 적용한다.
 * 플랫폼 정산은 멘티(케이스)×멘토 단위로 확정하므로 원천징수액이 조금 다를 수 있다 — 화면·엑셀에 안내.
 */

export type SlotMode = '온라인' | '오프라인' | '예정' | '미시행' | '타멘토';
export const SLOT_MODES: readonly SlotMode[] = ['온라인', '오프라인', '예정', '미시행', '타멘토'];

export interface AllowanceSlot {
  mode: SlotMode;
  /** 운영시간(시간, 소수 가능). 미시행·타멘토는 null */
  hours: number | null;
  note?: string;
}

export type Rounding = 'floor_10' | 'floor_1' | 'round';

export type TaxRule =
  | { method: 'other_income'; expenseRate: number; taxRate: number; localRate: number; rounding: Rounding; minTaxable: number }
  | { method: 'business_income'; taxRate: number; localRate: number; rounding: Rounding }
  | { method: 'none' };

export const TAX_METHOD_LABEL: Record<TaxRule['method'], string> = { other_income: '기타소득', business_income: '사업소득', none: '없음' };

export interface AllowanceRates {
  online: number;
  offline: number;
}

/** 회차 수당 = 이행(온라인·오프라인) 회차만 시간 × 시간당 단가, 원 단위 반올림 */
export function slotFee(slot: AllowanceSlot, rates: AllowanceRates): number {
  if (slot.hours === null) return 0;
  if (slot.mode === '온라인') return Math.round(slot.hours * rates.online);
  if (slot.mode === '오프라인') return Math.round(slot.hours * rates.offline);
  return 0;
}

function applyRounding(v: number, r: Rounding): number {
  if (r === 'floor_10') return Math.floor(v / 10) * 10;
  if (r === 'floor_1') return Math.floor(v);
  return Math.round(v);
}

/** 멘토 수당 합계에 대한 원천징수 (settlement/compute.ts computeSettlement 와 같은 단계) */
export function mentorTax(gross: number, rule: TaxRule): number {
  if (rule.method === 'other_income') {
    const taxable = Math.floor(gross * (1 - rule.expenseRate));
    if (taxable <= rule.minTaxable) return 0;
    const inc = applyRounding(taxable * rule.taxRate, rule.rounding);
    return inc + applyRounding(inc * rule.localRate, rule.rounding);
  }
  if (rule.method === 'business_income') {
    const inc = applyRounding(gross * rule.taxRate, rule.rounding);
    return inc + applyRounding(inc * rule.localRate, rule.rounding);
  }
  return 0;
}

/** 엑셀 반올림 식 */
function xlRound(expr: string, r: Rounding): string {
  if (r === 'floor_10') return `ROUNDDOWN(${expr},-1)`;
  if (r === 'floor_1') return `ROUNDDOWN(${expr},0)`;
  return `ROUND(${expr},0)`;
}

/** 단가표 시트의 세율 칸 주소 */
export interface TaxCells {
  expenseRate: string;
  otherTaxRate: string;
  otherLocalRate: string;
  minTaxable: string;
  bizTaxRate: string;
  bizLocalRate: string;
}

/** 멘토별 원천징수 엑셀 식 (= 없이). gross = 수당 합계 칸 주소 */
export function taxFormula(gross: string, rule: TaxRule, c: TaxCells): string {
  if (rule.method === 'other_income') {
    const taxable = `ROUNDDOWN(${gross}*(1-${c.expenseRate}),0)`;
    const inc = xlRound(`${taxable}*${c.otherTaxRate}`, rule.rounding);
    return `IF(${taxable}<=${c.minTaxable},0,${inc}+${xlRound(`${inc}*${c.otherLocalRate}`, rule.rounding)})`;
  }
  if (rule.method === 'business_income') {
    const inc = xlRound(`${gross}*${c.bizTaxRate}`, rule.rounding);
    return `${inc}+${xlRound(`${inc}*${c.bizLocalRate}`, rule.rounding)}`;
  }
  return '0';
}

/** 회차 수당 엑셀 식 (= 없이) */
export function slotFeeFormula(modeCell: string, hoursCell: string, onlineRate: string, offlineRate: string): string {
  return `IF(${modeCell}="온라인",ROUND(N(${hoursCell})*${onlineRate},0),IF(${modeCell}="오프라인",ROUND(N(${hoursCell})*${offlineRate},0),0))`;
}

/** 표에서 가장 많이 쓰인 값 (회차 단가 스냅샷 → 단가표 기본값) */
export function mostCommon(values: number[], fallback: number): number {
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  let best = fallback;
  let n = 0;
  for (const [v, k] of Array.from(count.entries())) if (k > n) { best = v; n = k; }
  return best;
}
