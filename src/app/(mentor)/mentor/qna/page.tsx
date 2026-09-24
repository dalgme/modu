import Link from 'next/link';

import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listBoardPosts } from '@/lib/data/board';
import { listMyThreads, listCaseThread, markThreadRead } from '@/lib/messages/data';
import { QnaBoard } from '@/components/board/qna-board';
import { MessageThread } from '@/components/messages/message-thread';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** 멘토 문의·게시판 + 담당 멘티 메시지 미니탭 (P20) */
export default async function Page({ searchParams }: { searchParams: { tab?: string; case?: string } }) {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const tab = searchParams.tab === 'messages' ? 'messages' : 'board';

  let body: React.ReactNode = null;
  let unreadTotal = 0;
  const threads = await listMyThreads(profile.id, 'mentor', ctx.programId);
  unreadTotal = threads.reduce((s, t) => s + t.unread, 0);

  if (tab === 'board') {
    const posts = await listBoardPosts(ctx.programId);
    body = <QnaBoard posts={posts} currentUserId={profile.id} currentRole={profile.role} />;
  } else {
    const selected = threads.find((t) => t.caseId === searchParams.case) ?? threads[0] ?? null;
    let messages: Awaited<ReturnType<typeof listCaseThread>> = [];
    if (selected) {
      await markThreadRead(selected.caseId, profile.id);
      messages = await listCaseThread(selected.caseId);
    }
    body = threads.length === 0 ? (
      <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">배정된 멘티가 없습니다. 멘티가 배정되면 여기서 메시지를 주고받을 수 있습니다.</p>
    ) : (
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <nav className="flex h-fit flex-col gap-1 rounded-xl border bg-background p-2">
          {threads.map((t) => (
            <Link
              key={t.caseId}
              href={`/mentor/qna?tab=messages&case=${t.caseId}`}
              className={cn(
                'flex flex-col rounded-lg px-3 py-2 text-sm',
                selected?.caseId === t.caseId ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              <span className="flex items-center justify-between gap-2 font-semibold">
                {t.ownerName}<span className={cn('font-normal', selected?.caseId === t.caseId ? 'text-primary-foreground/80' : 'text-muted-foreground')}>/{t.businessName}</span>
                {t.unread > 0 && <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">{t.unread}</span>}
              </span>
              {t.lastAt && (
                <span className={cn('truncate text-[11px]', selected?.caseId === t.caseId ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                  {t.lastPreview} · {formatDateTime(t.lastAt)}
                </span>
              )}
            </Link>
          ))}
        </nav>
        {selected && (
          <MessageThread
            caseId={selected.caseId}
            viewerId={profile.id}
            messages={messages}
            counterpartLabel={`${selected.ownerName} 멘티`}
          />
        )}
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">문의 및 요청하기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          운영사·멘토단 공용 게시판과 담당 멘티와의 1:1 메시지입니다.
        </p>
      </div>
      <nav className="flex flex-wrap gap-1.5">
        <Link href="/mentor/qna" className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === 'board' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
          멘토·운영 게시판
        </Link>
        <Link href="/mentor/qna?tab=messages" className={`relative rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === 'messages' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
          멘티 메시지
          {unreadTotal > 0 && <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadTotal}</span>}
        </Link>
      </nav>
      {body}
    </main>
  );
}
