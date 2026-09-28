import { redirect } from 'next/navigation';

import { requireInstitution } from '@/lib/auth/guards';

/**
 * 구 멘토 현황판 경로 — P20 게시판 통합 이후 현황판은 리포트 [진행현황] 탭(멘토 기준)이 담당한다.
 * (P35-D) 이전 목적지 `/institution/board?view=mentor` 는 존재하지 않아 404 였다.
 */
export default async function Page() {
  await requireInstitution();
  redirect('/institution/reports?tab=cases&view=mentor');
}
