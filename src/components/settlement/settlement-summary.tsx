import type { SettlementLine } from '@/lib/settlement/compute';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { formatKRW } from '@/lib/utils/format';

export interface SettlementFigures {
  lines: SettlementLine[];
  gross: number;
  taxable: number;
  income_tax: number;
  local_tax: number;
  withholding: number;
  net: number;
  method: 'other_income' | 'business_income' | 'none';
  exempted?: boolean;
}

/** 정산 집계 표 — 예상(미확정)과 확정 스냅샷이 같은 모양으로 보인다. */
export function SettlementSummary({ f, compact = false }: { f: SettlementFigures; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1 pr-2 font-medium">유형</th>
            <th className="py-1 pr-2 text-right font-medium">회차</th>
            {!compact && <th className="py-1 pr-2 text-right font-medium">단가</th>}
            <th className="py-1 text-right font-medium">금액</th>
          </tr>
        </thead>
        <tbody>
          {f.lines.length === 0 && (
            <tr>
              <td colSpan={compact ? 3 : 4} className="py-2 text-muted-foreground">
                정산 대상 회차가 없습니다.
              </td>
            </tr>
          )}
          {f.lines.map((l, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1 pr-2">
                {l.mode === 'online' ? '온라인' : '오프라인'}
                {l.is_extra && <span className="ml-1 text-xs text-muted-foreground">(추가 회차)</span>}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{l.count}회</td>
              {!compact && <td className="py-1 pr-2 text-right tabular-nums">{formatKRW(l.unit_price)}</td>}
              <td className="py-1 text-right tabular-nums">{formatKRW(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm sm:grid-cols-4">
        <dt className="text-muted-foreground">지급총액</dt>
        <dd className="text-right font-semibold tabular-nums">{formatKRW(f.gross)}</dd>
        <dt className="text-muted-foreground">원천징수 ({WITHHOLDING_LABELS[f.method]})</dt>
        <dd className="text-right tabular-nums">
          {formatKRW(f.withholding)}
          {f.exempted && <span className="ml-1 text-xs text-muted-foreground">과세최저한</span>}
        </dd>
        {!compact && (
          <>
            <dt className="text-muted-foreground">소득금액 / 소득세 / 지방세</dt>
            <dd className="text-right text-xs tabular-nums text-muted-foreground">
              {formatKRW(f.taxable)} / {formatKRW(f.income_tax)} / {formatKRW(f.local_tax)}
            </dd>
          </>
        )}
        <dt className="font-semibold">실지급 요청액</dt>
        <dd className="text-right text-base font-bold tabular-nums text-primary">{formatKRW(f.net)}</dd>
      </dl>
    </div>
  );
}
