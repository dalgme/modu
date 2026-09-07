import Link from 'next/link';
import { NotebookPen, FileText, Paperclip, Download } from 'lucide-react';

import { listMentoringLogs, listMentoringReportFiles } from '@/lib/data/mentoring-logs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatDateTime } from '@/lib/utils/format';

/**
 * 케이스의 멘토링 일지 회차 목록 (읽기 전용) — 각 회차 '출력 원본 보기' 링크.
 * 진흥원·넥스트랩 케이스 상세에서 멘토링 일지를 바로 확인하는 진입점.
 * @param viewBase 출력 원본 경로 접두 (예: `/institution/cases/${id}/log`, `/nextlab/cases/${id}/log`)
 */
export async function MentoringLogsPanel({
  caseId,
  viewBase,
}: {
  caseId: string;
  viewBase: string;
}) {
  const [logs, reportFiles] = await Promise.all([
    listMentoringLogs(caseId),
    listMentoringReportFiles(caseId),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <NotebookPen className="h-3.5 w-3.5" />
          </span>
          멘토링 일지 ({logs.length}회차{reportFiles.length > 0 ? ` · 첨부 ${reportFiles.length}` : ''})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          작성된 회차별 멘토링 일지를 &lsquo;출력 원본&rsquo;으로 확인·인쇄하거나, 멘토가 첨부한 완성본
          파일을 확인할 수 있습니다.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {reportFiles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" />
              멘토 첨부 완성본
            </p>
            <ul className="flex flex-col gap-1.5">
              {reportFiles.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-primary hover:underline"
                    >
                      {f.name}
                    </a>
                  ) : (
                    <span className="truncate">{f.name}</span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(f.createdAt)}
                  </span>
                  {f.downloadUrl && (
                    <a
                      href={f.downloadUrl}
                      aria-label="다운로드"
                      title="다운로드"
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-primary"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {logs.length === 0 && reportFiles.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            아직 작성·첨부된 멘토링 일지가 없습니다.
          </p>
        ) : logs.length === 0 ? null : (
          <ul className="flex flex-col gap-2">
            {logs.map((l, i) => (
              <li key={l.id}>
                <Link
                  href={`${viewBase}/${l.id}/view`}
                  className="flex items-start justify-between gap-3 rounded-lg border border-l-4 border-status-approved/30 border-l-status-approved bg-status-approved-bg p-3 transition-colors hover:bg-status-approved/10 dark:bg-status-approved/10"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <span className="rounded-full bg-status-approved px-2 py-0.5 text-xs font-bold text-white">
                        {i + 1}회차
                      </span>
                      <span className="font-medium">{formatDate(l.visited_at)}</span>
                      {l.topic && <span className="text-muted-foreground">· {l.topic}</span>}
                    </div>
                    {l.content && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{l.content}</p>
                    )}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 self-center rounded-md border px-2 py-1 text-xs font-medium text-primary">
                    <FileText className="h-3.5 w-3.5" />
                    출력 원본
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
