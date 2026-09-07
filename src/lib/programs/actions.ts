'use server';

import { redirect } from 'next/navigation';

import { clearContextCookie } from '@/lib/programs/context';

/** 컨텍스트 해제 → 허브(행사/그룹 선택) */
export async function leaveContextAction(): Promise<void> {
  clearContextCookie();
  redirect('/hub?pick=1');
}
