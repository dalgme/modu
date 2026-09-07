import { redirect } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';

/** 현황판 통합 — 멘티별 탭으로 이동 */
export default async function Page() {
  await requireNextlab();
  redirect('/nextlab/board?view=mentee');
}
