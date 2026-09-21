import { redirect } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';

/** 멘토·운영 게시판 → 게시판(멘토·운영 게시판) 미니탭으로 통합 (P20) */
export default async function Page() {
  await requireNextlab();
  redirect('/nextlab/board?tab=qna');
}
