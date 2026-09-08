/* eslint-disable @next/next/no-img-element */
import { PLATFORM_BRANDING } from '@/lib/programs/branding';

/**
 * 히어로 위 브랜딩 개념어 — 플랫폼이 하는 일을 7개 단어로 요약해 사진 위에 띄운다.
 * 기관명·행사명 리터럴은 쓰지 않는다(로그인은 모든 행사가 공유하는 플랫폼 화면, docs/MODU-DESIGN.md §17).
 */
const CONCEPTS: { ko: string; en: string; accent?: boolean }[] = [
  { ko: '연결', en: 'CONNECT', accent: true },
  { ko: '매칭', en: 'MATCH' },
  { ko: '회차', en: 'ROUNDS' },
  { ko: '보고서 · 서명', en: 'REPORT' },
  { ko: '검수', en: 'REVIEW' },
  { ko: '정산', en: 'SETTLE' },
  { ko: '현황', en: 'INSIGHT' },
];

export function LoginHeroWords() {
  return (
    <div className="relative z-10 flex h-full flex-col justify-between">
      {/* 상단: 플랫폼 이름 */}
      <div className="flex items-center gap-3">
        <img src="/brand/mark-on-dark.png" alt="" aria-hidden="true" className="h-10 w-10 object-contain drop-shadow-lg" />
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-wide">{PLATFORM_BRANDING.appTitle}</p>
          <p className="text-[11px] uppercase tracking-[0.28em] text-midnight-foreground/60">Mentoring Operations</p>
        </div>
      </div>

      {/* 중단: 개념어 — 사진의 어두운 좌측 띠를 따라 세로로 */}
      <ul className="flex max-w-xs flex-wrap gap-2">
        {CONCEPTS.map((c, i) => (
          <li
            key={c.en}
            style={{ animationDelay: `${i * 120}ms` }}
            className={`animate-in fade-in slide-in-from-left-2 fill-mode-both rounded-full border px-3.5 py-1.5 backdrop-blur-md duration-700 ${
              c.accent ? 'border-brand-teal/70 bg-brand-teal/25 text-white' : 'border-white/20 bg-white/10 text-midnight-foreground'
            }`}
          >
            <span className="text-sm font-semibold">{c.ko}</span>
            <span className="ml-1.5 text-[10px] font-medium tracking-[0.2em] text-midnight-foreground/60">{c.en}</span>
          </li>
        ))}
      </ul>

      {/* 하단: 헤드라인 + 설명 */}
      <div className="max-w-md space-y-4">
        <h1 className="text-4xl font-bold leading-[1.2]">
          멘토와 멘티를
          <br />
          <span className="text-brand-teal">1:1</span>로 연결하고, 끝까지 관리
        </h1>
        <p className="text-sm leading-relaxed text-midnight-foreground/75">
          배정 · 컨설팅 회차 · 보고서와 서명 · 관찰의견서 · 검수 · 정산과 지급 품의까지 한 흐름으로. 여러 행사를 계정 추가만으로 운영합니다.
        </p>
        <p className="text-xs text-midnight-foreground/45">© 2026 · 내부 업무용 시스템</p>
      </div>
    </div>
  );
}
