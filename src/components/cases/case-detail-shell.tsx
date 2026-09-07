import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import type { Tables } from '@/types/database';
import type { Branding } from '@/lib/programs/branding';
import { StatusBadge } from '@/components/cases/status-badge';
import { ProcessStepBar } from '@/components/cases/process-step-bar';
import { CaseDetailCard } from '@/components/cases/case-detail-card';
import { CaseTimeline } from '@/components/cases/case-timeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils/format';

/**
 * 케이스 상세 공통 뼈대: 헤더(상태·진행바) + 정보 카드 + 타임라인 + 이전 단계 이력.
 * 역할별 패널(배정·회차·검수·정산)은 children 으로 끼운다.
 */
export function CaseDetailShell({
  item,
  history,
  predecessors,
  branding,
  basePath,
  showLoginId = false,
  children,
}: {
  item: CaseListItem;
  history: Tables<'case_status_history'>[];
  predecessors: CaseListItem[];
  branding: Branding;
  basePath: string;
  showLoginId?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{item.business_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.owner_name} · {item.supportTypeName ?? '-'} · 회차 {item.roundsDone}/{item.requiredRounds}
          </p>
        </div>
        <StatusBadge status={item.status} branding={branding} showStep />
      </div>
      <ProcessStepBar status={item.status} branding={branding} />

      {children}

      <div className="grid gap-5 lg:grid-cols-2">
        <CaseDetailCard item={item} showLoginId={showLoginId} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">진행 이력</CardTitle>
          </CardHeader>
          <CardContent>
            <CaseTimeline status={item.status} history={history} branding={branding} />
          </CardContent>
        </Card>
      </div>

      {predecessors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">이전 단계 이력 (승계)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {predecessors.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span>
                    <Link href={`${basePath}/${p.id}`} className="font-medium hover:underline">
                      {p.supportTypeName ?? '이전 그룹'}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      멘토 {p.mentorName ?? '-'} · 회차 {p.roundsDone}/{p.requiredRounds} · {formatDate(p.created_at)}
                    </span>
                  </span>
                  <StatusBadge status={p.status} branding={branding} short />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
