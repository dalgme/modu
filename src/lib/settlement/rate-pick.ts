/**
 * 단가 행 고르기 (2026-11-02) — 단가 해석(resolveRate)과 미정산 회차 단가 재적용(reprice)이 같이 쓰는 순수 함수.
 * 순서: 그 그룹의 행 → 행사 기본 행(support_type_id null). 같은 범위 안에서는 적용일(effective_from) ≤ 기준일 중 가장 늦은 행.
 * 같은 적용일 행이 여럿이면 나중에 만든 행(created_at)이 이긴다.
 */
export interface RateRowLike {
  id: string;
  mode: string;
  unit_price: number | string;
  daily_cap_amount: number | string;
  effective_from: string;
  support_type_id: string | null;
  created_at?: string | null;
}

function latest<T extends RateRowLike>(rows: T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best || r.effective_from > best.effective_from || (r.effective_from === best.effective_from && (r.created_at ?? '') > (best.created_at ?? ''))) best = r;
  }
  return best;
}

export function pickRateRow<T extends RateRowLike>(rows: T[], supportTypeId: string | null, mode: string, onDate: string): T | null {
  const usable = rows.filter((r) => r.mode === mode && r.effective_from <= onDate);
  const own = supportTypeId ? latest(usable.filter((r) => r.support_type_id === supportTypeId)) : null;
  return own ?? latest(usable.filter((r) => r.support_type_id === null));
}
