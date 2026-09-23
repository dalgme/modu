'use client';

import { useEffect } from 'react';

/** 가로 스크롤 탭 내비에서 현재 탭이 화면 밖에 있으면 보이게 스크롤 (모바일, P28) */
export function useScrollActiveTab(pathname: string) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('nav [aria-current="page"]');
    if (!el) return;
    const box = el.parentElement;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    el.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);
}
