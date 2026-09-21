import { redirect } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';

/** 승계 개설 → 운영 설정(승계 개설) 미니탭으로 이전 (P20) */
export default async function Page({ searchParams }: { searchParams: { source?: string } }) {
  await requireNextlab();
  redirect(`/nextlab/settings?tab=succession${searchParams.source ? `&source=${searchParams.source}` : ''}`);
}
