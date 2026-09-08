'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react';

/** 새 히어로 이미지(운영자 실사 합성, 청록 아이콘). 파일이 아직 없으면 이전 webp 로 폴백한다. */
const HERO_SRC = '/images/login-hero.jpg';
const FALLBACK_SRC = '/images/login-hero.webp';

/**
 * 로그인 히어로 배경.
 * 사진 자체가 청록·네이비 톤이라 색보정은 가볍게 두고, 텍스트가 놓이는 좌측·하단만 스크림으로 눌러 가독성을 확보한다.
 * 인물 얼굴(중앙 우측 상단)은 가리지 않는다.
 */
export function LoginHeroBg() {
  const [src, setSrc] = useState(HERO_SRC);
  const ref = useRef<HTMLImageElement>(null);
  // SSR 로 그려진 <img> 가 하이드레이션 전에 실패하면 onError 가 다시 오지 않으므로 마운트 시 한 번 확인한다.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setSrc(FALLBACK_SRC);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <img
        ref={ref}
        src={src}
        alt=""
        aria-hidden="true"
        onError={() => {
          if (src !== FALLBACK_SRC) setSrc(FALLBACK_SRC);
        }}
        className="absolute inset-0 h-full w-full object-cover object-[62%_center]"
      />
      {/* 통일감: 미드나이트로 아주 살짝 */}
      <div className="absolute inset-0 bg-[hsl(223_47%_16%/0.18)] mix-blend-multiply" />
      {/* 가독성 스크림 — 좌측(개념어·헤드라인)·하단(문구) */}
      <div className="absolute inset-0 bg-gradient-to-r from-[hsl(224_52%_9%/0.86)] via-[hsl(224_50%_11%/0.38)] to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(224_52%_8%/0.88)] via-[hsl(224_52%_8%/0.25)] to-transparent" />
      {/* 코랄 글로우 (브랜드 포인트) */}
      <div className="absolute -left-20 bottom-24 h-72 w-72 rounded-full bg-[hsl(9_84%_61%/0.28)] blur-3xl" />
      {/* 비네트 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,hsl(224_55%_6%/0.45))]" />
    </div>
  );
}
