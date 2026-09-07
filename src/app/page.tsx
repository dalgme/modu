import { redirect } from 'next/navigation';

import { getRealSessionProfile } from '@/lib/auth/guards';

// 진입점: 로그인 상태면 허브(행사/그룹 선택 · 단일 활성이면 자동 진입)로, 아니면 로그인 화면으로.
export default async function Home() {
  const profile = await getRealSessionProfile();
  if (!profile || !profile.is_active) redirect('/login');
  if (profile.must_change_password) redirect('/change-password');
  redirect('/hub');
}
