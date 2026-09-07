import { redirect } from 'next/navigation';

import { requireMentee } from '@/lib/auth/guards';
import { getCaseById } from '@/lib/data/cases';
import { CASE_STATUS_META } from '@/types/case-status';

/**
 * (구) 업로드 진입점 — 신 지원신청(사전)/자금신청(사후) 화면으로 일원화됨.
 * 기존 링크·북마크 호환을 위해 단계에 맞는 화면으로 리다이렉트한다.
 */
export default async function Page({ params }: { params: { id: string } }) {
  await requireMentee();
  const item = await getCaseById(params.id);
  const step = item ? CASE_STATUS_META[item.status].step : 0;
  // 승인 통보(9단계) 이후면 자금신청(사후), 그 전이면 지원신청(사전)
  if (step >= CASE_STATUS_META.notified.step) {
    redirect('/mentee/post-support');
  }
  redirect('/mentee/pre-support');
}
