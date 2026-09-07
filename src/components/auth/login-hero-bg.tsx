/* eslint-disable @next/next/no-img-element */

/**
 * 로그인 히어로 배경.
 * 실사 합성 이미지(소상공인·자영업자 · 도시 스카이라인 · 성장 지표)를 배경으로 깔고,
 * 그 위에 코랄/미드나이트 색보정과 가독성 스크림·그레인·비네트를 얹어
 * '화려하게 보정한 실사 배경' 느낌을 낸다.
 */
export function LoginHeroBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 1. 실사 배경 사진 */}
      <img
        src="/images/login-hero.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      {/* 2. 브랜드 색보정 듀오톤 (코랄 ↔ 블루, 오버레이 블렌드) */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(9_84%_55%/0.38)] via-transparent to-[hsl(212_80%_45%/0.30)] mix-blend-overlay" />
      {/* 전체 톤을 미드나이트로 살짝 눌러 통일감 */}
      <div className="absolute inset-0 bg-[hsl(223_47%_16%/0.28)] mix-blend-multiply" />

      {/* 3. 가독성 스크림 — 좌측(헤드라인)·하단(푸터) 어둡게 */}
      <div className="absolute inset-0 bg-gradient-to-r from-[hsl(224_52%_9%/0.82)] via-[hsl(224_50%_11%/0.42)] to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(224_52%_8%/0.80)] via-transparent to-[hsl(224_52%_8%/0.35)]" />

      {/* 4. 코랄 글로우 (좌상단 브랜드 포인트) */}
      <div className="absolute -left-24 top-8 h-80 w-80 rounded-full bg-[hsl(9_84%_61%/0.30)] blur-3xl" />

      {/* 5. 그레인 (실사 질감) */}
      <div
        className="absolute inset-0 opacity-[0.10] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* 6. 비네트 */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_58%,hsl(224_55%_6%/0.5))]" />
    </div>
  );
}
