import Link from 'next/link';

/** 정산 5단계 흐름 띠 (운영사 정산·품의 화면 상단, P28) — 지금 어느 단계 화면인지와 앞뒤 단계가 어디서 진행되는지 한 줄로. */
function steps(institution: boolean): { n: number; label: string; where: string; href?: string }[] {
  return [
    { n: 1, label: '검수 승인', where: '[검수] 화면 · 회차 보고서·관찰의견서 확인 후 승인', href: '/nextlab/review' },
    { n: 2, label: '지급 품의 (자동)', where: '검수 승인 즉시 멘토별 품의가 이 화면 목록에 올라옴' },
    { n: 3, label: '품의 확인', where: '제목을 눌러 회차·금액 확인 · 일정이 안 맞으면 [검수로 되돌리기]' },
    { n: 4, label: '정산 확인', where: institution ? '발주처가 품의를 확인(발주처 정산 품의 기능 켠 라운드)' : '목록 행의 [정산 확인] → 멘티 종결 · 확인 날짜 표시' },
    { n: 5, label: '지급 완료', where: '목록 행의 [지급 완료] · 수당 산출내역 엑셀' },
  ];
}

/** institution = 발주처 [정산 품의] 기능을 켠 라운드가 있을 때 4단계 문구를 발주처 기준으로 (2026-11-16) */
export function SettlementFlowStrip({ current, institution = false }: { current: 2 | 3 | 4; institution?: boolean }) {
  const STEPS = steps(institution);
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
