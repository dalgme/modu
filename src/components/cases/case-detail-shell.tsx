import Link from 'next/link';

import { menteeLabel } from '@/lib/utils/labels';

import type { CaseListItem } from '@/lib/data/cases';
import type { Tables } from '@/types/database';
import type { Branding } from '@/lib/programs/branding';
import { StatusBadge } from '@/components/cases/status-badge';
import { ProcessStepBar } from '@/components/cases/process-step-bar';
import { CaseDetailCard } from '@/components/cases/case-detail-card';
import { CaseTimeline } from '@/components/cases/case-timeline';
import { ContactLinks } from '@/components/common/contact-links';
import { MentorName } from '@/components/common/mentor-name';
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
  successors = [],
  predecessorLinks = true,
  branding,
  basePath,
  showLoginId = false,
  children,
}: {
  item: CaseListItem;
  history: Tables<'case_status_history'>[];
  predecessors: CaseListItem[];
  /** 승계 다음 단계 케이스 (스태프 화면, P30) */
  successors?: CaseListItem[];
  /** false 면 이전 단계를 링크 없이 요약만 (멘토는 이전 케이스를 열 수 없다) */
  predecessorLinks?: boolean;
  branding: Branding;
  basePath: string;
  showLoginId?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{menteeLabel(item.owner_name, item.business_name)}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
            <span>{item.phone || '-'}</span>
            {/* (P31) 헤더에서 바로 전화·문자 */}
            <ContactLinks phone={item.phone} name={item.owner_name} size="xs" />
            <span>· {item.supportTypeName ?? '-'} · 회차 {item.roundsDone}/{item.requiredRounds}</span>
          </p>
        </div>
        <StatusBadge status={item.status} branding={branding} showStep />
      </div>
      <ProcessStepBar status={item.status} branding={branding} />

      {/* (P31) 폰 요약 카드 — 멘티 연락처·담당 멘토를 헤더 바로 아래에 (정보 카드는 아래쪽에 있어 스크롤이 길다) */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border bg-background p-3 text-sm md:hidden">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">멘티 연락처</span>
          <span className="font-medium">{item.phone || '-'}</span>
          <ContactLinks phone={item.phone} name={item.owner_name} size="sm" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">담당 멘토</span>
          {item.mentorId && item.mentorName ? (
            <>
              <MentorName id={item.mentorId} name={item.mentorName} count={item.mentorActiveCount} caseHrefBase={basePath} />
              <ContactLinks phone={(item as { mentorPhone?: string | null }).mentorPhone} name={item.mentorName} size="sm" />
            </>
          ) : (
            <span className="text-muted-foreground">미배정</span>
          )}
        </div>
      </div>

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

      {successors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">다음 단계 (승계됨)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {successors.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/30 px-3 py-2">
                  <span>
                    <Link href={`${basePath}/${n.id}`} className="font-medium hover:underline">
                      다음 단계: {n.supportTypeName ?? '다음 그룹'} 케이스 →
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      멘토 {n.mentorName ?? '미배정'} · 회차 {n.roundsDone}/{n.requiredRounds} · {formatDate(n.created_at)}
                    </span>
                  </span>
                  <StatusBadge status={n.status} branding={branding} short />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {predecessors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">이전 단계 이력 (승계)</CardTitle>
            {!predecessorLinks && <p className="text-xs text-muted-foreground">이전 단계는 다른 배정이라 요약만 표시됩니다. 이전 회차 보고서가 필요하면 운영사에 요청하세요.</p>}
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {predecessors.map((p, i) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                  <span>
                    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{predecessors.length - i}단계 전</span>
                    {predecessorLinks ? (
                      <Link href={`${basePath}/${p.id}`} className="font-medium hover:underline">
                        {p.supportTypeName ?? '이전 그룹'}
                      </Link>
                    ) : (
                      <span className="font-medium">{p.supportTypeName ?? '이전 그룹'}</span>
                    )}
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
