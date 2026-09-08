/* eslint-disable @next/next/no-img-element */

/**
 * 로그인 히어로 배경 — 실사 합성 이미지(운영자·팀·청록 아이콘, public/images/login-hero.png).
 * 사진이 이미 청록·네이비 톤이라 색보정은 가볍게, 텍스트가 놓이는 좌측·하단만 스크림으로 눌러 가독성을 확보한다.
 * 인물 얼굴(중앙 우측 상단)은 가리지 않는다.
 */
export function LoginHeroBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <img src="/images/login-hero.png" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-[62%_center]" />
      <div className="absolute inset-0 bg-[hsl(223_47%_16%/0.18)] mix-blend-multiply" />
      <div className="absolute inset-0 bg-gradient-to-r from-[hsl(210_68%_9%/0.88)] via-[hsl(210_60%_11%/0.40)] to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[hsl(210_68%_8%/0.90)] via-[hsl(210_68%_8%/0.25)] to-transparent" />
      <div className="absolute -left-20 bottom-24 h-72 w-72 rounded-full bg-brand-teal/25 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,hsl(210_60%_6%/0.45))]" />
    </div>
  );
}
