import type { CaseListItem } from '@/lib/data/cases';
import { Card, CardContent } from '@/components/ui/card';
import { SETTLED_STATUSES } from '@/types/case-status';

/** 대시보드 상단 요약 타일 (수행 성과 · 잔여 과업의 최소 세트 — 상세 지표는 P6 리포트) */
export function CaseStats({ items }: { items: CaseListItem[] }) {
  const total = items.length;
  const unassigned = items.filter((c) => c.status === 'registered' || c.status === 'reassignment_pending').length;
  const inProgress = items.filter((c) => c.status === 'in_progress' || c.status === 'mentor_assigned' || c.status === 'revision_requested').length;
  const reviewWait = items.filter((c) => c.status === 'closure_requested').length;
  const settled = items.filter((c) => SETTLED_STATUSES.includes(c.status)).length;
  const closed = items.filter((c) => c.status === 'closed').length;
  const plannedRounds = items.reduce((s, c) => s + c.requiredRounds, 0);
  const doneRounds = items.reduce((s, c) => s + Math.min(c.roundsDone, c.requiredRounds), 0);
  const pct = plannedRounds > 0 ? Math.round((doneRounds / plannedRounds) * 100) : 0;

  const tiles: { label: string; value: string; sub?: string }[] = [
    { label: '전체 케이스', value: String(total) },
    { label: '이행 회차 / 계획', value: `${doneRounds} / ${plannedRounds}`, sub: `${pct}%` },
    { label: '진행 중', value: String(inProgress) },
    { label: '배정 대기', value: String(unassigned) },
    { label: '검수 대기(종결 요청)', value: String(reviewWait) },
    { label: '정산 확정 / 종결', value: `${settled} / ${closed}` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{t.value}</p>
            {t.sub && <p className="text-xs text-muted-foreground">{t.sub}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
