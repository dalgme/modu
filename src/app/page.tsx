import { redirect } from 'next/navigation';

import { getRealSessionProfile } from '@/lib/auth/guards';
import { roleHome } from '@/lib/auth/roles';

// 진입점: 로그인 상태면 역할 홈으로, 아니면 로그인 화면으로.
// 대행 중에도 '실제 신원' 기준으로 보낸다 — 대행 중 로고를 눌렀을 때 멘토 홈으로 빨려들어가
// 대행 중임을 잊게 되는 동선을 막는다.
export default async function Home() {
  const profile = await getRealSessionProfile();
  if (!profile || !profile.is_active) {
    redirect('/login');
  }
  if (profile.must_change_password) {
    redirect('/change-password');
  }
  redirect(roleHome(profile.role));
}
