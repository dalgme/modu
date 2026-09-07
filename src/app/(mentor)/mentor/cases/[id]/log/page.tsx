import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireMentor } from '@/lib/auth/guards';
import { getCaseById } from '@/lib/data/cases';
import { listMentoringLogs, listMentoringReportFiles } from '@/lib/data/mentoring-logs';
import { logRequirement } from '@/lib/workflow/mentor-tasks';
import { MentoringLogForm } from '@/components/cases/mentoring-log-form';
import { MentoringLogRowActions } from '@/components/cases/mentoring-log-row-actions';
import { MentoringReportAttach } from '@/components/cases/mentoring-report-attach';
import { DeliverableTabs } from '@/components/cases/deliverable-tabs';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/utils/format';

export default async function Page({ params }: { params: { id: string } }) {
  await requireMentor();
  const item = await getCaseById(params.id);
  if (!item) notFound();

  const logs = await listMentoringLogs(item.id);
  const reportFiles = await listMentoringReportFiles(item.id);
  const { min, max } = logRequirement(item.supportTypeCode);
  const typeLabel = item.supportTypeCode === 'closure' ? '폐업정리' : '경영개선';
  const count = logs.length;
  const atMax = count >= max;
  const nextNo = count + 1;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘토링 일지</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.business_name} · 완성한 보고서를 <b>파일로 첨부</b>하거나, <b>웹에서 직접 작성</b>할 수
          있습니다.
        </p>
      </div>

      <DeliverableTabs
        attachHint="완성한 보고서 파일을 올리면 바로 제출됩니다 (기본)"
        webHint="회차별로 플랫폼에서 직접 작성"
        attach={<MentoringReportAttach caseId={item.id} files={reportFiles} />}
        web={
          <div className="flex flex-col gap-5">
            {/* 회차 요건 안내 */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-3 text-sm">
          <span className="font-semibold text-primary">{typeLabel}</span> 멘토링 일지 요건 — 최소{' '}
          <b>{min}회</b> · 최대 <b>{max}회</b> (현재 <b>{count}회</b> 작성
          {count < min ? ` · ${min - count}회 더 필요` : atMax ? ' · 최대 도달' : ' · 추가 작성 가능'})
        </CardContent>
      </Card>

      {/* 작성된 회차 목록 */}
      {logs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">작성된 일지 ({logs.length}회)</h2>
          {logs.map((l, i) => (
            <div
              key={l.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-l-4 border-status-approved/30 border-l-status-approved bg-status-approved-bg p-3 text-sm transition-colors dark:bg-status-approved/10"
            >
              <Link
                href={`/mentor/cases/${item.id}/log/${l.id}/view`}
                className="min-w-0 flex-1 rounded-md transition-colors hover:bg-status-approved/10"
                aria-label={`${i + 1}회차 멘토링 일지 출력 원본 보기`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="rounded-full bg-status-approved px-2 py-0.5 text-xs font-bold text-white">
                    {i + 1}회차
                  </span>
                  <span className="font-medium">{formatDate(l.visited_at)}</span>
                  {l.topic && <span className="text-muted-foreground">· {l.topic}</span>}
                  {l.place && <span className="text-xs text-muted-foreground">· {l.place}</span>}
                  <span className="text-xs text-primary underline-offset-2 hover:underline">
                    · 출력 원본 보기
                  </span>
                </div>
                {l.content && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.content}</p>
                )}
              </Link>
              <MentoringLogRowActions caseId={item.id} logId={l.id} />
            </div>
          ))}
        </div>
      )}

      {/* 새 회차 작성 (최대 도달 시 폼 숨김) */}
      {atMax ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            최대 회차({max}회)까지 작성했습니다. 추가 작성이 필요하면 넥스트랩에 문의하세요.
          </CardContent>
        </Card>
      ) : (
        <>
          <h2 className="text-lg font-semibold">
            {nextNo}회차 일지 작성
            {count < min && (
              <span className="ml-2 text-sm font-normal text-primary">(필수 {min}회 중 {nextNo}번째)</span>
            )}
          </h2>
          <MentoringLogForm caseId={item.id} />
        </>
      )}
          </div>
        }
      />

      <CaseDetailBackNav dashboardHref="/mentor/dashboard" />
    </main>
  );
}
