import Link from 'next/link';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listInbox } from '@/lib/data/requests';
import { InboxList } from '@/components/nextlab/inbox-list';

export const dynamic = 'force-dynamic';

/** 요청함 — 추가 회차 / 멘토 변경(멘티) / 멘토 중도 종료 */
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const all = searchParams.tab === 'all';
  const items = await listInbox(ctx.programId, ctx.supportTypeId ?? undefined, !all);
  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">요청함</h1>
          <p className="mt-1 text-sm text-muted-foreground">멘토의 추가 회차·중도 종료 요청과 멘티의 멘토 변경 요청을 처리합니다. {ctx.group ? `(${ctx.group.name})` : ''}</p>
        </div>
        <div className="flex gap-1">
          <Link href="/nextlab/requests" className={`rounded-full px-3 py-1 text-xs font-semibold ${!all ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>대기</Link>
          <Link href="/nextlab/requests?tab=all" className={`rounded-full px-3 py-1 text-xs font-semibold ${all ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>전체</Link>
        </div>
      </div>
      <InboxList items={items} />
    </main>
  );
}
