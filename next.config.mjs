/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 멘토링 사진 등 파일 업로드 서버 액션 본문 크기 상향
    serverActions: {
      bodySizeLimit: '20mb',
    },
    // Playwright(PDF 생성)는 번들링하지 않고 런타임 require (native 의존성)
    serverComponentsExternalPackages: ['playwright-core', '@sparticuz/chromium'],
    // @sparticuz/chromium 의 Chromium 바이너리(bin/*.br)는 코드 참조가 아니라
    // 데이터 파일이라 자동 추적에서 누락된다. PDF 생성 라우트에 강제 포함한다.
    outputFileTracingIncludes: {
      '/mentor/cases/[id]': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/mentor/cases/[id]/apply': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/nextlab/cases/[id]': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/institution/cases/[id]': ['./node_modules/@sparticuz/chromium/bin/**'],
    },
  },
};

export default nextConfig;
