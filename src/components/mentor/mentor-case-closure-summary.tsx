import { CheckCircle2, CircleDashed } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { SETTLEMENT_STATUS_LABELS } from '@/lib/settlement/labels';

/** 종결 상황을 보여 줄 케이스 상태 — 종결 요청 이후 단계 + 중도 종료 */
export const CLOSURE_SUMMARY_STATUSES = ['closure_requested', 'revision_requested', 'settlement_pending', 'settlement_batched', 'closed', 'withdrawn'] as const;

export function showsClosureSummary(status: string): boolean {
  return (CLOSURE_SUMMARY_STATUSES as readonly string[]).includes(status);
}

const STATUS_TITLE: Record<string, string> = {
  closure_requested: '종결 요청 — 운영사 검수 대기',
  revision_requested: '보완 요청 — 수정 후 다시 종결 요청',
  settlement_pending: '검수 승인 · 정산 확정 (지급 대기)',
  settlement_batched: '지급 품의 편성',
  closed: '종결 확정',
  withdrawn: '중도 종료',
};

/**
 * 멘토 케이스 화면의 "종결 상황" 요약 (2026-10-01).
 * 종결 확정 뒤에도 멘토가 이 멘티와의 행사·그룹·회차·관찰의견서·정산 결과를 한눈에 다시 볼 수 있게 한다(열람 전용).
 */
export function MentorCaseClosureSummary({
  status,
  programName,
  groupName,
  assignedAt,
  steps,
  reported,
  required,
  observationName,
  settlements,
}: {
  status: string;
  programName: string;
  groupName: string | null;
  assignedAt: string | null;
  /** 단계별 마지막 시각 (상태 이력) */
  steps: { closureRequestedAt: string | null; approvedAt: string | null; batchedAt: string | null; closedAt: string | null; withdrawnAt: string | null };
  reported: number;
  required: number;
  observationName: string | null;
  settlements: { id: string; kind: string; status: string; net: number; gross: number; roundCount: number; paidAt: string | null }[];
}) {
  const live = settlements.filter((s) => s.status !== 'canceled');
  const netTotal = live.reduce((a, s) => a + s.net, 0);
  const timeline: { label: string; at: string | null }[] = [
    { label: '멘토 배정', at: assignedAt },
    { label: '종결 요청', at: steps.closureRequestedAt },
    { label: '검수 승인(정산 확정)', at: steps.approvedAt },
    { label: '지급 품의', at: steps.batchedAt },
    status === 'withdrawn' ? { label: '중도 종료', at: steps.withdrawnAt } : { label: '종결 확정', at: steps.closedAt },
  ];
  return (
    <Card id="closure" className="scroll-mt-36 border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          종결 상황
          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">{STATUS_TITLE[status] ?? status}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">종결 후에도 이 화면에서 회차·보고서·관찰의견서·정산 결과를 계속 열람할 수 있습니다. 내용 수정은 할 수 없습니다.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-background p-3">
            <dt className="text-[11px] font-medium text-muted-foreground">행사</dt>
            <dd className="font-semibold">{programName}</dd>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <dt className="text-[11px] font-medium text-muted-foreground">그룹</dt>
            <dd className="font-semibold">{groupName ?? '-'}</dd>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <dt className="text-[11px] font-medium text-muted-foreground">이행 회차 (보고서 등록)</dt>
            <dd className="font-semibold tabular-nums">
              {reported} / {required}회
            </dd>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <dt className="text-[11px] font-medium text-muted-foreground">관찰의견서</dt>
            <dd className="truncate font-semibold" title={observationName ?? undefined}>
              {observationName ? '제출 완료' : '미제출'}
            </dd>
          </div>
        </dl>

        <ol className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {timeline.map((t) => (
            <li key={t.label} className="inline-flex items-center gap-1.5">
              {t.at ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className={t.at ? 'font-medium' : 'text-muted-foreground'}>{t.label}</span>
              <span className="tabular-nums text-muted-foreground">{t.at ? formatDate(t.at) : '-'}</span>
            </li>
          ))}
        </ol>

        {live.length > 0 ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">내 정산 결과</p>
            <ul className="flex flex-col gap-1.5">
              {live.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{s.kind === 'partial' ? '부분 정산' : '종결 정산'}</span>
                  <span className="tabular-nums">{s.roundCount}회</span>
                  <span className="tabular-nums">지급액(세전) {s.gross.toLocaleString('ko-KR')}원</span>
                  <span className="font-semibold tabular-nums">실지급 {s.net.toLocaleString('ko-KR')}원</span>
                  <span className="text-xs text-muted-foreground">
                    {SETTLEMENT_STATUS_LABELS[s.status] ?? s.status}
                    {s.paidAt ? ` · 지급일 ${formatDateTime(s.paidAt)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {live.length > 1 && <p className="mt-2 text-xs font-semibold tabular-nums">실지급 합계 {netTotal.toLocaleString('ko-KR')}원</p>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{status === 'closure_requested' || status === 'revision_requested' ? '검수 승인 시 정산이 확정됩니다.' : '확정된 정산이 없습니다.'}</p>
        )}
      </CardContent>
    </Card>
  );
}
