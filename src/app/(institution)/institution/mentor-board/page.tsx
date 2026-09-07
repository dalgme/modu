import { redirect } from 'next/navigation';

import { requireInstitution } from '@/lib/auth/guards';

/** 현황판 통합 — 멘토별 탭으로 이동 */
export default async function Page() {
  await requireInstitution();
  redirect('/institution/board?view=mentor');
}
