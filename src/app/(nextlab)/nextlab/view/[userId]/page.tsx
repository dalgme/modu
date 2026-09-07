import { notFound } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';
import { getMemberById } from '@/lib/data/members';
import { ViewAsDashboard, VIEW_AS_TABS } from '@/components/nextlab/view-as-dashboard';
import { ViewAsShell } from '@/components/nextlab/view-as-shell';

export default async function Page({
  params,
  searchParams,
}: {
  params: { userId: string };
  searchParams: { tab?: string };
}) {
  await requireNextlab();
  const target = await getMemberById(params.userId);
  if (!target) notFound();

  const tabs = VIEW_AS_TABS[target.role];
  const activeTab = tabs.find((t) => t.key === searchParams.tab)?.key ?? tabs[0]!.key;

  return (
    <main className="flex flex-col gap-5">
      <ViewAsShell target={target} activeTab={activeTab} />
      <ViewAsDashboard target={target} tab={activeTab} />
    </main>
  );
}
