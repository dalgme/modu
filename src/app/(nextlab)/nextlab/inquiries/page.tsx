import { requireNextlab } from '@/lib/auth/guards';
import {
  listInquiries,
  INQUIRY_CATEGORY_LABELS,
  INQUIRY_STATUS_LABELS,
} from '@/lib/data/inquiries';
import { InquiryAnswerForm } from '@/components/inquiries/inquiry-answer-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export default async function Page() {
  await requireNextlab();
  const inquiries = await listInquiries();
  const openCount = inquiries.filter((q) => q.status === 'open').length;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘티 문의</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          멘티 문의를 확인하고 답변합니다. 미답변{' '}
          <span className="font-semibold text-status-progress">{openCount}건</span>
        </p>
      </div>

      {inquiries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          접수된 문의가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {inquiries.map((q) => {
            const answered = q.status !== 'open';
            return (
              <Card key={q.id} className={cn(!answered && 'border-status-progress/40')}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      <Badge variant="secondary" className="mr-2 align-middle text-[11px]">
                        {INQUIRY_CATEGORY_LABELS[q.category] ?? '기타'}
                      </Badge>
                      {q.subject}
                    </CardTitle>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        answered
                          ? 'bg-status-approved/10 text-status-approved'
                          : 'bg-status-progress/10 text-status-progress',
                      )}
                    >
                      {INQUIRY_STATUS_LABELS[q.status] ?? '접수'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {q.menteeName ?? '멘티'}
                    {q.businessName ? ` · ${q.businessName}` : ''} · {formatDateTime(q.created_at)}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="whitespace-pre-wrap text-sm">{q.body}</p>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      {q.answer ? '답변 (수정 가능)' : '답변 작성'}
                    </p>
                    <InquiryAnswerForm id={q.id} initialAnswer={q.answer ?? undefined} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
