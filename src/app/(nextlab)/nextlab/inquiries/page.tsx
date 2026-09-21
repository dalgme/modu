import { redirect } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';

/** 멘티 문의 → 게시판(멘티 문의) 미니탭으로 통합 (P20) */
export default async function Page() {
  await requireNextlab();
  redirect('/nextlab/board?tab=inquiries');
}
