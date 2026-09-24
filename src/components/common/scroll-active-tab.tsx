'use client';

import { useEffect, useRef } from 'react';

/**
 * (P31) 가로 스크롤 메뉴 안에서 현재(aria-current="page" 또는 aria-pressed="true") 항목이 화면 밖이면 보이게 스크롤.
 * 서버 컴포넌트(SubTabs)나 클라이언트 컴포넌트(ScopeSwitcher) 어디서든 스크롤 컨테이너 안에 한 번 렌더링하면 된다.
 * useSearchParams 를 쓰지 않고(Suspense 경계 불필요) 렌더마다 URL 키를 비교해 바뀐 경우에만 스크롤한다.
 */
export function ScrollActiveTab() {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef<string>('');
  useEffect(() => {
    const key = `${window.location.pathname}${window.location.search}`;
    const box = ref.current?.parentElement;
    if (!box) return;
    const el = box.querySelector<HTMLElement>('[aria-current="page"], [aria-pressed="true"]');
    if (!el) return;
    // 같은 URL 에서 같은 항목이면 다시 스크롤하지 않는다(사용자 스크롤 방해 방지)
    const sig = `${key}#${el.textContent ?? ''}`;
    if (sig === last.current) return;
    last.current = sig;
    if (box.scrollWidth <= box.clientWidth) return;
    el.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
  return <span ref={ref} hidden aria-hidden="true" />;
}
