/** @type {import('next').NextConfig} */
const nextConfig = {
  // 구 경로 리다이렉트 (P32) — 붙임서식 노출 토글 페이지(/admin/settings/features)는 폐지, 운영 설정으로 보낸다.
  // (기능 플래그는 플랫폼 콘솔 행사 상세 [기능 활성화] 로 이전됨 — P15/P26)
  async redirects() {
    return [{ source: '/admin/settings/features', destination: '/nextlab/settings', permanent: false }];
  },
  experimental: {
    // 멘토링 사진 등 파일 업로드 서버 액션 본문 크기 상향
    serverActions: {
      bodySizeLimit: '20mb',
    },
    // Playwright(PDF 생성)는 번들링하지 않고 런타임 require (native 의존성)
    serverComponentsExternalPackages: ['playwright-core', '@sparticuz/chromium'],
    // @sparticuz/chromium 의 Chromium 바이너리(bin/*.br)는 코드 참조가 아니라
    // 데이터 파일이라 자동 추적에서 누락된다. PDF 생성 라우트에 강제 포함한다.
    // PDF 를 만드는 서버 액션이 호출되는 페이지 라우트 전부 (회차 보고서·관찰의견서·정산서):
    //  멘토 케이스 상세(회차 저장·종결), 멘티 회차 서명(보고서 재생성), 운영사 케이스 상세(검수 승인·중도 종료),
    //  요청함(중도 종료 승인 → 부분 정산서), 발주처 케이스 상세(멘티 중도 종료 → 부분 정산서)
    outputFileTracingIncludes: {
      '/mentor/cases/[id]': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/mentee/rounds': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/nextlab/cases/[id]': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/nextlab/requests': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/institution/cases/[id]': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/api/reports/summary/[id]/export': ['./node_modules/@sparticuz/chromium/bin/**'],
    },
  },
};

export default nextConfig;
