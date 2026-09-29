import { redirect } from 'next/navigation';

/** (2026-09-30) 문자 API 설정은 운영 설정 탭 안으로 이동 — 상단 설정 메뉴가 유지되도록 */
export default function Page() {
  redirect('/nextlab/settings?tab=sms-api');
}
