import { redirect } from 'next/navigation';

import { requireStaff } from '@/lib/auth/guards';

/** 구 경로 — 운영사 감사 로그는 운영 설정 미니탭으로 통합됨 (P20). 발주처는 플랫폼 감사로그 열람 권한이 없으므로 리포트로 보낸다. */
export default async function Page() {
  const profile = await requireStaff();
  redirect(profile.role === 'nextlab' ? '/nextlab/settings?tab=audit' : '/institution/reports');
}
