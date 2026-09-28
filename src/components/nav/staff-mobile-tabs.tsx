import { MobileTabBar } from '@/components/common/mobile-tab-bar';
import type { MoreMenuItem } from '@/components/common/more-menu-sheet';

/**
 * (P31) 발주처·운영사 공용 하단 탭바 — 아이콘은 이름 문자열(MobileTabIcon)로만 넘긴다(서버 컴포넌트 → 클라이언트 직렬화) — (nextlab)·(institution)·(admin: 문자 발송 등 공용 화면) 레이아웃이 같은 구성을 쓴다.
 *  운영사: 홈 · 매칭(멘티 매칭 리스트) · 요청(게시판 처리 대기, 배지) · 문자 · 더보기(나머지 메뉴 + 로그아웃)
 *  발주처: 홈 · 리포트 · 정산 · 요청 · 더보기
 */
export function StaffMobileTabs({ role, pendingCount = 0 }: { role: 'nextlab' | 'institution'; pendingCount?: number }) {
  if (role === 'institution') {
    const more: MoreMenuItem[] = [
      { href: '/institution/mentors', label: '멘토 현황' },
      { href: '/admin/settings/sms', label: '문자 발송' },
      { href: '/institution/guide', label: '이용방법' },
      { href: '/institution/install', label: '휴대폰 설치', hint: '홈 화면에 앱처럼 추가' },
    ];
    return (
      <MobileTabBar
        tabs={[
          { href: '/institution/dashboard', label: '홈', icon: 'dashboard' },
          { href: '/institution/reports', label: '리포트', icon: 'clipboard' },
          { href: '/institution/settlements', label: '정산', icon: 'coins' },
          { href: '/institution/requests', label: '요청', icon: 'inbox', badge: pendingCount },
        ]}
        more={more}
      />
    );
  }
  const more: MoreMenuItem[] = [
    { href: '/nextlab/reports', label: '리포트' },
    { href: '/nextlab/settlements', label: '정산·품의' },
    { href: '/nextlab/roster', label: '회원 명단' },
    { href: '/nextlab/board', label: '게시판' },
    { href: '/nextlab/surveys', label: '조사' },
    { href: '/nextlab/settings', label: '운영 설정' },
    { href: '/guide.html#tab-op', label: '이용안내', external: true, hint: '새 창으로 열림' },
    { href: '/nextlab/install', label: '휴대폰 설치', hint: '홈 화면에 앱처럼 추가' },
  ];
  return (
    <MobileTabBar
      tabs={[
        { href: '/nextlab/dashboard', label: '홈', icon: 'dashboard' },
        { href: '/nextlab/roster?tab=mentee-match', label: '매칭', icon: 'users', match: ['/nextlab/cases', '/nextlab/members', '/nextlab/view'] },
        { href: '/nextlab/board?tab=requests', label: '요청', icon: 'inbox', badge: pendingCount, match: ['/nextlab/requests'] },
        { href: '/admin/settings/sms', label: '문자', icon: 'message-text' },
      ]}
      more={more}
    />
  );
}
