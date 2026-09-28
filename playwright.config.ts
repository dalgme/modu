import { defineConfig, devices } from '@playwright/test';

import { EXTRA_HEADERS } from './e2e/bypass';

/**
 * 배포 화면 스모크 점검 (P34-A) — `npm run smoke`.
 *
 * 필수 환경변수: SMOKE_BASE_URL(점검할 배포 URL), SMOKE_PASSWORD(점검 계정 4개 공통 비밀번호).
 * 선택: SMOKE_SEED_TOKEN — 있으면 globalSetup 이 `/api/ops/smoke-seed` 를 먼저 호출해 계정·데이터를 보장한다.
 *
 * 스펙 파일은 `e2e/*.smoke.ts` 만 수집한다(vitest 는 `src/**\/*.test.ts` 만 보므로 충돌 없음).
 * 브라우저는 chromium 하나만 설치하면 된다 — 모바일 프로젝트도 chromium 으로 iPhone 13 뷰포트·터치를 에뮬레이션한다.
 */

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.smoke.ts',
  globalSetup: './e2e/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 1,
  // (P35-D) 첫 실제 실행에서 러너 IP 의 동시 요청 폭주를 Vercel 엣지가 403 으로 막았다(앱 로그엔 없음).
  // 워커 2 + 파일 안 순차 실행 + 화면 사이 짧은 간격(helpers.ts) 으로 요청 속도를 낮춘다.
  workers: 2,
  fullyParallel: false,
  // 산출물은 e2e/ 아래(e2e/.gitignore 로 제외) — 저장소 루트를 더럽히지 않는다
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report' }]],
  outputDir: 'e2e/test-results',
  use: {
    baseURL: process.env.SMOKE_BASE_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    screenshot: 'only-on-failure',
    // 트레이스는 재시도 1회째만 — retain-on-failure 는 리포트 아티팩트가 256MB 까지 커졌다 (P35-D)
    trace: 'on-first-retry',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    // (P35-D) VERCEL_AUTOMATION_BYPASS_SECRET 이 있으면 Deployment Protection 우회 헤더 — e2e/bypass.ts
    extraHTTPHeaders: EXTRA_HEADERS,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // iPhone 13 프리셋은 기본 브라우저가 webkit 이라 chromium 으로 고정한다(설치 브라우저 1개 유지)
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
