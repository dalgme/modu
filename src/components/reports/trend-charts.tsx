import type { TrendMonth } from '@/lib/reports/trend';
import { formatKRW } from '@/lib/utils/format';

/**
 * 월별 추이 차트 (P22) — 지표별 소형 차트 4개(축 공유 없음, 이중축 금지).
 * 순수 HTML/CSS 컬럼: 호버 시 값 표시, 최댓값·최근 달은 상시 라벨. 하단에 표(접근성·검증용) 동봉.
 */

const fmtMonth = (m: string) => `${Number(m.slice(5, 7))}월`;
const fmtManwon = (n: number) => (n >= 10000 ? `${Math.round(n / 10000).toLocaleString('ko-KR')}만` : String(n));

function ColumnChart({
  title,
  data,
  color,
  money = false,
}: {
  title: string;
  data: { month: string; value: number }[];
  /** 단일 색조 — 차트당 1지표 1색 (범례 불필요, 제목이 지표명) */
  color: string;
  money?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best]!.value ? i : best), 0);
  const lastIdx = data.length - 1;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 bg-background p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">12개월 합계 {money ? formatKRW(total) : `${total.toLocaleString('ko-KR')}건`}</span>
      </div>
      {total === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">아직 데이터가 없습니다.</p>
      ) : (
        <div className="flex h-32 items-end gap-1">
          {data.map((d, i) => {
            const showLabel = (i === maxIdx || i === lastIdx) && d.value > 0;
            return (
              <div key={d.month} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={`${d.month} · ${money ? formatKRW(d.value) : `${d.value}건`}`}>
                {/* (P31) 폰은 hover 가 없어 값 라벨을 항상 표시 */}
                <span className={`text-[9px] font-semibold tabular-nums leading-none text-muted-foreground ${showLabel ? '' : 'opacity-70'}`}>
                  {money ? fmtManwon(d.value) : d.value}
                </span>
                <div
                  className={`w-full rounded-t ${color} transition-opacity group-hover:opacity-80`}
                  style={{ height: `${Math.max(d.value > 0 ? 4 : 1, (d.value / max) * 100)}%` }}
                />
                <span className="text-[9px] leading-none text-muted-foreground">{fmtMonth(d.month)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TrendCharts({ months }: { months: TrendMonth[] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">최근 12개월(한국 시간 기준). 막대를 누르면 상세(신규·종결)가 표시됩니다. 지급액은 지급총액(원천징수 공제 전)입니다.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ColumnChart title="이행 회차 (보고서 등록)" color="bg-sky-600" data={months.map((m) => ({ month: m.month, value: m.rounds }))} />
        <ColumnChart title="확정 지급총액" color="bg-emerald-600" money data={months.map((m) => ({ month: m.month, value: m.settledGross }))} />
        <ColumnChart title="신규 멘티(케이스) 등록" color="bg-violet-600" data={months.map((m) => ({ month: m.month, value: m.newCases }))} />
        <ColumnChart title="종결 케이스" color="bg-slate-500" data={months.map((m) => ({ month: m.month, value: m.closedCases }))} />
      </div>
      <div className="overflow-x-auto rounded-xl border-2 bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-muted-foreground">
              <th className="px-2 py-1.5">월</th>
              <th className="px-2 py-1.5 text-right">이행 회차</th>
              <th className="px-2 py-1.5 text-right">확정 지급총액</th>
              <th className="px-2 py-1.5 text-right">신규 케이스</th>
              <th className="px-2 py-1.5 text-right">종결</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-b last:border-0">
                <td className="px-2 py-1 font-medium">{m.month}</td>
                <td className="px-2 py-1 text-right tabular-nums">{m.rounds}</td>
                <td className="px-2 py-1 text-right tabular-nums">{formatKRW(m.settledGross)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{m.newCases}</td>
                <td className="px-2 py-1 text-right tabular-nums">{m.closedCases}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
