import { redirect } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';

/** 요청함 → 게시판(요청함) 미니탭으로 통합 (P20) */
export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  await requireNextlab();
  redirect(`/nextlab/board?tab=requests${searchParams.tab === 'all' ? '&sub=all' : ''}`);
}
