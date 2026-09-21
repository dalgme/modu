import { redirect } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';

/** 멘토 명단 → 회원 명단(멘토 명단) 미니탭으로 이전 (P20) */
export default async function Page() {
  await requireNextlab();
  redirect('/nextlab/roster?tab=mentor');
}
