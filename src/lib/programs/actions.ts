'use server';

import { redirect } from 'next/navigation';

import { getRealSessionProfile, getSessionProfile } from '@/lib/auth/guards';
import { clearContextCookie } from '@/lib/programs/context';
import { enterProgram } from '@/lib/programs/enter';

/** 컨텍스트 해제 → 허브(행사/그룹 선택) */
export async function leaveContextAction(): Promise<void> {
  clearContextCookie();
  redirect('/hub?pick=1');
}

/**
 * 허브 그룹 카드 → 행사·그룹(기수) 진입 (2026-10-29).
 * 쿠키를 바꾸는 진입은 POST(서버 액션)로만 — GET 링크는 미리 불러오기·링크 미리보기(폰 길게 누르기)만으로도 실행돼
 * 사용자가 누르지 않은 그룹으로 범위가 바뀐다. 이 액션은 쿠키를 바꾸므로 Next 가 화면 캐시도 함께 비운다.
 */
export async function enterContextAction(formData: FormData): Promise<void> {
  const real = await getRealSessionProfile();
  const effective = await getSessionProfile();
  if (!real || !real.is_active || !effective) redirect('/login');
  if (real.must_change_password) redirect('/change-password');
  const programId = String(formData.get('program') ?? '');
  if (!programId) redirect('/hub');
  const group = String(formData.get('group') ?? '');
  const all = formData.get('all') === '1';
  const result = await enterProgram(real, effective, programId, group || null, all);
  redirect(result.redirectTo);
}
