/**
 * 정산 계산 — **단 한 곳** (docs/MODU-DESIGN.md §6-2, CLAUDE.md §2-4).
 * 순수 함수: DB·환경 접근 없음. 화면의 "예상 정산액"과 확정 스냅샷(T7·T10·T11)이 모두 이 함수를 호출한다.
 * 단가·세율은 전부 입력으로 받는다 — 코드에 숫자 없음.
 */

export type SettlementMode = 'online' | 'offline';

export interface SettlementRoundInput {
  log_id: string;
  round_no: number;
  mode: SettlementMode;
  started_at: string;
  /** 회차 등록 시점의 단가 스냅샷 */
  unit_price_snapshot: number;
  /** 회차 등록 시점의 금액 스냅샷 (보통 단가와 같다) */
  amount_snapshot: number;
  is_extra: boolean;
  mentor_id: string;
}

export type Rounding = 'floor_10' | 'floor_1' | 'round';

export type WithholdingPolicy =
  | {
      method: 'other_income';
      /** 필요경비율 (기타소득: 0.6) */
      expense_rate: number;
      /** 소득세율 (0.20) */
      tax_rate: number;
      /** 지방소득세율 = 소득세의 비율 (0.10) */
      local_rate: number;
      rounding: Rounding;
      /** 과세최저한 — 기타소득금액(taxable)이 이 값 이하이면 원천징수 없음 */
      min_taxable_exempt: number;
    }
  | {
      method: 'business_income';
      tax_rate: number;
      local_rate: number;
      rounding: Rounding;
    }
  | { method: 'none' };

export interface SettlementLine {
  mode: SettlementMode;
  is_extra: boolean;
  count: number;
  unit_price: number;
  amount: number;
}

export interface SettlementResult {
  lines: SettlementLine[];
  round_count: number;
  gross: number;
  taxable: number;
  income_tax: number;
  local_tax: number;
  withholding: number;
  net: number;
  /** 과세최저한 적용으로 원천징수가 0이 된 경우 */
  exempted: boolean;
  policy: WithholdingPolicy;
}

export function applyRounding(value: number, rounding: Rounding): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  switch (rounding) {
    case 'floor_10':
      return Math.floor(value / 10) * 10;
    case 'floor_1':
      return Math.floor(value);
    case 'round':
      return Math.round(value);
  }
}

/** 유형 × 추가회차 × 단가 로 묶은 내역 줄. 정렬: 온라인 → 오프라인, 기본 → 추가. */
export function buildLines(rounds: SettlementRoundInput[]): SettlementLine[] {
  const map = new Map<string, SettlementLine>();
  for (const r of rounds) {
    const unit = num(r.unit_price_snapshot);
    const key = `${r.mode}|${r.is_extra ? 1 : 0}|${unit}`;
    const line = map.get(key) ?? { mode: r.mode, is_extra: r.is_extra, count: 0, unit_price: unit, amount: 0 };
    line.count += 1;
    line.amount += num(r.amount_snapshot);
    map.set(key, line);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.mode !== b.mode) return a.mode === 'online' ? -1 : 1;
    if (a.is_extra !== b.is_extra) return a.is_extra ? 1 : -1;
    return a.unit_price - b.unit_price;
  });
}

/**
 * 정산 계산. 입력 회차는 **한 멘토분**이어야 한다(케이스 × 멘토 단위). 여러 멘토가 섞여 있으면 throw.
 */
export function computeSettlement(input: { rounds: SettlementRoundInput[]; withholding: WithholdingPolicy }): SettlementResult {
  const { rounds, withholding } = input;
  const mentors = new Set(rounds.map((r) => r.mentor_id));
  if (mentors.size > 1) throw new Error('정산 단위는 케이스 × 멘토입니다. 멘토별로 나누어 계산하세요.');

  const lines = buildLines(rounds);
  const gross = lines.reduce((s, l) => s + l.amount, 0);

  let taxable = 0;
  let income_tax = 0;
  let local_tax = 0;
  let exempted = false;

  if (withholding.method === 'other_income') {
    taxable = applyRounding(gross * (1 - withholding.expense_rate), 'floor_1');
    if (taxable <= withholding.min_taxable_exempt) {
      exempted = taxable > 0 || gross > 0;
      income_tax = 0;
      local_tax = 0;
    } else {
      income_tax = applyRounding(taxable * withholding.tax_rate, withholding.rounding);
      local_tax = applyRounding(income_tax * withholding.local_rate, withholding.rounding);
    }
  } else if (withholding.method === 'business_income') {
    taxable = gross;
    income_tax = applyRounding(gross * withholding.tax_rate, withholding.rounding);
    local_tax = applyRounding(income_tax * withholding.local_rate, withholding.rounding);
  } else {
    taxable = 0;
  }

  const withholdingTotal = income_tax + local_tax;
  return {
    lines,
    round_count: rounds.length,
    gross,
    taxable,
    income_tax,
    local_tax,
    withholding: withholdingTotal,
    net: gross - withholdingTotal,
    exempted,
    policy: withholding,
  };
}

/** 케이스 전체 회차를 멘토별로 나눈다 (부분 정산·멘토 교체 대비). */
export function splitByMentor(rounds: SettlementRoundInput[]): Map<string, SettlementRoundInput[]> {
  const out = new Map<string, SettlementRoundInput[]>();
  for (const r of rounds) {
    const list = out.get(r.mentor_id) ?? [];
    list.push(r);
    out.set(r.mentor_id, list);
  }
  return out;
}

/** 여러 정산 건의 합계 (품의 합계 = 건별 net 의 합, 재계산하지 않는다). */
export function sumSettlements(items: { gross: number; withholding: number; net: number }[]): { gross: number; withholding: number; net: number } {
  return items.reduce(
    (acc, s) => ({ gross: acc.gross + num(s.gross), withholding: acc.withholding + num(s.withholding), net: acc.net + num(s.net) }),
    { gross: 0, withholding: 0, net: 0 },
  );
}

/** 행사 설정(JSON)에서 방식별 파라미터를 읽어 정책 객체를 만든다. 값이 없거나 깨졌으면 throw (조용히 기본값을 쓰지 않는다). */
export function policyFromParams(method: WithholdingPolicy['method'], params: unknown): WithholdingPolicy {
  if (method === 'none') return { method: 'none' };
  const root = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>;
  const p = (root[method] && typeof root[method] === 'object' ? root[method] : null) as Record<string, unknown> | null;
  if (!p) throw new Error(`원천징수 파라미터(${method})가 행사 설정에 없습니다.`);
  const rate = (k: string): number => {
    const v = Number(p[k]);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`원천징수 파라미터 ${method}.${k} 가 올바르지 않습니다.`);
    return v;
  };
  const rounding: Rounding = p.rounding === 'floor_1' || p.rounding === 'round' ? p.rounding : 'floor_10';
  if (method === 'other_income') {
    const exempt = Number(p.min_taxable_exempt ?? 0);
    return {
      method,
      expense_rate: rate('expense_rate'),
      tax_rate: rate('tax_rate'),
      local_rate: rate('local_rate'),
      rounding,
      min_taxable_exempt: Number.isFinite(exempt) && exempt >= 0 ? exempt : 0,
    };
  }
  return { method, tax_rate: rate('tax_rate'), local_rate: rate('local_rate'), rounding };
}

/** 실효세율 표시용 (예: 기타소득 8.8%) */
export function effectiveRate(policy: WithholdingPolicy): number {
  if (policy.method === 'other_income') return (1 - policy.expense_rate) * policy.tax_rate * (1 + policy.local_rate);
  if (policy.method === 'business_income') return policy.tax_rate * (1 + policy.local_rate);
  return 0;
}

export const WITHHOLDING_LABELS: Record<WithholdingPolicy['method'], string> = {
  other_income: '기타소득',
  business_income: '사업소득',
  none: '원천징수 없음',
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
