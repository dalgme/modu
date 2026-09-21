import Link from 'next/link';

import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import {
  listMyInquiries,
  INQUIRY_CATEGORY_LABELS,
  INQUIRY_STATUS_LABELS,
} from '@/lib/data/inquiries';
import { listMyThreads, listCaseThread, markThreadRead } from '@/lib/messages/data';
import { InquiryForm } from '@/components/inquiries/inquiry-form';
import { MessageThread } from '@/components/messages/message-thread';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** 멘티 문의 + 담당 멘토 메시지 미니탭 (P20) */
export default async function Page({ searchParams }: { searchParams: { tab?: string; case?: string } }) {
  const profile = await requireMentee();
  const ctx = await requireContext(profile);
  const tab = searchParams.tab === 'messages' ? 'messages' : 'inquiries';
  const threads = await listMyThreads(profile.id, 'mentee', ctx.programId);
  const unreadTotal = threads.reduce((s, t) => s + t.unread, 0);

  let body: React.ReactNode = null;

  if (tab === 'messages') {
    const withMentor = threads.filter((t) => t.mentorId);
    const selected = withMentor.find((t) => t.caseId === searchParams.case) ?? withMentor[0] ?? null;
    let messages: Awaited<ReturnType<typeof listCaseThread>> = [];
    if (selected) {
      await markThreadRead(selected.caseId, profile.id);
      messages = await listCaseThread(selected.caseId);
    }
    body = !selected ? (
      <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">아직 담당 멘토가 배정되지 않았습니다. 멘토가 배정되면 여기서 메시지를 주고받을 수 있습니다.</p>
    ) : (
      <div className="flex flex-col gap-3">
        {withMentor.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {withMentor.map((t) => (
              <Link key={t.caseId} href={`/mentee/inquiries?tab=messages&case=${t.caseId}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${selected.caseId === t.caseId ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
                {t.businessName}{t.unread > 0 ? ` (${t.unread})` : ''}
              </Link>
            ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground">담당 멘토 <b>{selected.mentorName}</b> 님과의 메시지입니다. 새 메시지가 오면 대시보드에 알림이 표시됩니다.</p>
        <MessageThread caseId={selected.caseId} viewerId={profile.id} messages={messages} counterpartLabel={`${selected.mentorName ?? '담당 멘토'} 멘토`} />
      </div>
    );
  } else {
    const inquiries = await listMyInquiries(profile.id);
    body = (
      <>
        <div className="flex justify-end"><InquiryForm /></div>
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
                          answered ? 'bg-status-approved/10 text-status-approved' : 'bg-status-progress/10 text-status-progress',
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
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">답변</p>
                        <p className="whitespace-pre-wrap text-sm">{q.answer}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">문의하기 · 내역</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          운영기관에 문의를 남기거나, 담당 멘토와 1:1 메시지를 주고받습니다.
        </p>
      </div>
      <nav className="flex flex-wrap gap-1.5">
        <Link href="/mentee/inquiries" className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === 'inquiries' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
          운영기관 문의
        </Link>
        <Link href="/mentee/inquiries?tab=messages" className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === 'messages' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
          멘토 메시지
          {unreadTotal > 0 && <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadTotal}</span>}
        </Link>
      </nav>
      {body}
    </main>
  );
}
