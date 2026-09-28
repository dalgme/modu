import { defineConfig, devices } from '@playwright/test';

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
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 1,
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,
  // 산출물은 e2e/ 아래(e2e/.gitignore 로 제외) — 저장소 루트를 더럽히지 않는다
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report' }]],
  outputDir: 'e2e/test-results',
  use: {
    baseURL: process.env.SMOKE_BASE_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // iPhone 13 프리셋은 기본 브라우저가 webkit 이라 chromium 으로 고정한다(설치 브라우저 1개 유지)
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
