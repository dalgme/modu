import { redirect } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';

/** 회원관리 → 회원 명단(관리자 명단)으로 통합 이전 (P20) */
export default async function Page() {
  await requireNextlab();
  redirect('/nextlab/roster?tab=staff');
}
