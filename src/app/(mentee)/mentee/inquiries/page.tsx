import { requireMentee } from '@/lib/auth/guards';
import {
  listMyInquiries,
  INQUIRY_CATEGORY_LABELS,
  INQUIRY_STATUS_LABELS,
} from '@/lib/data/inquiries';
import { InquiryForm } from '@/components/inquiries/inquiry-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export default async function Page() {
  const profile = await requireMentee();
  const inquiries = await listMyInquiries(profile.id);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">문의하기 · 내역</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            오른쪽 &lsquo;문의하기&rsquo; 버튼으로 불편사항·기능요청·가이드 문의를 남기면
            운영기관(넥스트랩)이 확인 후 답변드립니다. 남긴 문의와 답변은 아래에서 확인할 수 있습니다.
          </p>
        </div>
        <InquiryForm />
      </div>

      {inquiries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          아직 문의내역이 없습니다. 위 &lsquo;문의하기&rsquo;로 문의를 남겨 주세요.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {inquiries.map((q) => {
            const answered = q.status === 'answered' || !!q.answer;
            return (
              <Card key={q.id}>
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
                      {INQUIRY_STATUS_LABELS[answered ? 'answered' : q.status] ?? '접수'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(q.created_at)}</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p className="whitespace-pre-wrap text-sm">{q.body}</p>
                  {q.answer && (
                    <div className="rounded-md border-l-2 border-status-approved bg-status-approved/5 p-3">
                      <p className="text-xs font-semibold text-status-approved">운영기관 답변</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{q.answer}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
