import Link from 'next/link';
import { MessageCircleQuestion, CheckCircle2, AlertTriangle } from 'lucide-react';

import type { CaseListItem } from '@/lib/data/cases';
import type { MenteeSubmissionSummary } from '@/lib/data/mentee-progress';
import type { SupplementRequestItem } from '@/lib/data/supplement-requests';
import { CASE_STATUS_META } from '@/types/case-status';
import { MenteeSupplementAlerts } from '@/components/support/mentee-supplement-alerts';
import { MenteeNextAction } from '@/components/mentee/mentee-next-action';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/cases/status-badge';
import { MenteeJourney } from '@/components/cases/mentee-journey';
import { cn } from '@/lib/utils';

/** 제출 현황 한 줄 (진행률 + 상태) */
function PhaseRow({
  label,
  href,
  requiredTotal,
  presentTotal,
  missing,
  submittedAt,
  complete,
}: {
  label: string;
  href: string;
  requiredTotal: number;
  presentTotal: number;
  missing: string[];
  submittedAt: string | null;
  complete: boolean;
}) {
  const pct = requiredTotal > 0 ? Math.round((presentTotal / requiredTotal) * 100) : 0;
  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {submittedAt ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-approved">
            <CheckCircle2 className="h-3.5 w-3.5" /> 제출 완료
          </span>
        ) : requiredTotal === 0 ? (
          <span className="text-xs text-muted-foreground">준비 전</span>
        ) : (
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {presentTotal}/{requiredTotal}
          </span>
        )}
      </div>
      {requiredTotal > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full', complete ? 'bg-status-approved' : 'bg-amber-500')}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      {!submittedAt && missing.length > 0 && (
        <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          부족: {missing.slice(0, 2).join(', ')}
          {missing.length > 2 ? ` 외 ${missing.length - 2}건` : ''}
        </p>
      )}
    </Link>
  );
}

/**
 * 멘티 대시보드 본문. 실제 멘티 페이지와 넥스트랩 회원 열람(view-as)에서 공용으로 렌더한다.
 * 제출 현황은 실제 업로드(신청단위 si:/post:)를 반영한다.
 */
export function MenteeDashboardBody({
  name,
  myCase,
  summary,
  supplements = [],
  viewAsUserId,
}: {
  name: string;
  myCase: CaseListItem | null;
  summary: MenteeSubmissionSummary | null;
  supplements?: SupplementRequestItem[];
  /** 회원 열람 중이면 대상 회원 id — 메뉴 링크를 view-as 경로로 유지해 열람이 풀리지 않게 한다. */
  viewAsUserId?: string;
}) {
  // 열람 중에는 멘티 실제 경로 대신 view-as 경로로 연결(탭이 있으면 해당 탭, 없으면 열람 대시보드)
  const menuHref = (real: string, tab?: string) =>
    viewAsUserId
      ? tab
        ? `/nextlab/view/${viewAsUserId}?tab=${tab}`
        : `/nextlab/view/${viewAsUserId}`
      : real;
  const step = myCase ? CASE_STATUS_META[myCase.status].step : 0;
  const notifiedStep = CASE_STATUS_META.notified.step; // 8
  const showPost = step >= notifiedStep;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">내 진행 현황</h1>
          <p className="mt-1 text-sm text-muted-foreground">{name}님, 환영합니다.</p>
        </div>
        <Button asChild size="lg" className="shadow-sm">
          <Link href={menuHref('/mentee/inquiries', 'inquiries')}>
            <MessageCircleQuestion className="h-5 w-5" />
            문의하기
          </Link>
        </Button>
      </div>

      {/* 보완 요청 알림 (있으면 최상단 강조) */}
      <MenteeSupplementAlerts requests={supplements} />

      {/* 지금 하실 일 — 단계별 쉬운 안내 (멘티가 가장 먼저 보는 안내) */}
      {myCase && <MenteeNextAction status={myCase.status} viewAsUserId={viewAsUserId} />}

      {!myCase ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          아직 연결된 케이스가 없습니다. 운영팀의 안내를 기다려 주세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">{myCase.business_name}</CardTitle>
                <StatusBadge status={myCase.status} showStep />
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <MenteeJourney status={myCase.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">서류 제출 현황</CardTitle>
              <p className="text-xs text-muted-foreground">
                실제 업로드 기준입니다. 항목을 누르면 해당 화면에서 이어서 올릴 수 있습니다.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {summary ? (
                <>
                  <PhaseRow
                    label="지원신청 (사전)"
                    href={menuHref('/mentee/pre-support')}
                    requiredTotal={summary.pre.requiredTotal}
                    presentTotal={summary.pre.presentTotal}
                    missing={summary.pre.missing}
                    submittedAt={summary.pre.submittedAt}
                    complete={summary.pre.complete}
                  />
                  {showPost && (
                    <PhaseRow
                      label="자금신청 (사후)"
                      href={menuHref('/mentee/post-support')}
                      requiredTotal={summary.post.requiredTotal}
                      presentTotal={summary.post.presentTotal}
                      missing={summary.post.missing}
                      submittedAt={summary.post.submittedAt}
                      complete={summary.post.complete}
                    />
                  )}
                  <Link
                    href={menuHref('/mentee/contractor-signatures')}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
                  >
                    <span className="font-semibold">공사업체 서명받기</span>
                    <span className="text-xs text-muted-foreground">
                      {summary.signatures > 0 ? `${summary.signatures}건 완료` : '미등록'}
                    </span>
                  </Link>
                </>
              ) : (
                <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  제출할 서류 정보가 아직 없습니다.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
