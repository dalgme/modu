import Link from 'next/link';

/** 정산 5단계 흐름 띠 (운영사 정산·품의 화면 상단, P28) — 지금 어느 단계 화면인지와 앞뒤 단계가 어디서 진행되는지 한 줄로. */
const STEPS: { n: number; label: string; where: string; href?: string }[] = [
  { n: 1, label: '검수 승인', where: '케이스 상세 [검수 승인 · 정산 확정]', href: '/nextlab/reports?tab=cases' },
  { n: 2, label: '지급 대기', where: '이 화면 [지급 대기] 목록' },
  { n: 3, label: '품의 편성 · 제출', where: '지급 대기 건 선택 → 품의 만들기 → 제출' },
  { n: 4, label: '정산 확인', where: '발주처가 품의를 확인' },
  { n: 5, label: '지급 완료 · 종결', where: '품의 상세 [지급 완료] → 케이스 종결' },
];

export function SettlementFlowStrip({ current }: { current: 2 | 3 }) {
  return (
    <ol className="flex gap-1 overflow-x-auto rounded-xl border bg-background p-2 text-xs">
      {STEPS.map((s) => {
        const active = s.n === current;
        const body = (
          <span className={`flex min-w-[9rem] flex-col rounded-lg px-2.5 py-1.5 ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground'}`}>
            <span className="font-bold">
              {s.n}. {s.label}
            </span>
            <span className={`text-[11px] ${active ? 'text-primary-foreground/85' : ''}`}>{s.where}</span>
          </span>
        );
        return (
          <li key={s.n} className="flex items-center gap-1">
            {s.href && !active ? <Link href={s.href} className="hover:opacity-90">{body}</Link> : body}
            {s.n < STEPS.length && <span className="text-muted-foreground">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
