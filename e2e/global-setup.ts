import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

import { chromium, type FullConfig } from '@playwright/test';

import { EXTRA_HEADERS } from './bypass';
import { AUTH_DIR, ROLE_HOME, SEED_RESULT_PATH, SMOKE_EMAILS, SMOKE_PASSWORD, SMOKE_ROLES, authStatePath, login } from './helpers';

/**
 * 스모크 전역 준비 (P34-A)
 *  1) SMOKE_SEED_TOKEN 이 있으면 `/api/ops/smoke-seed` 를 호출해 점검 행사·계정·케이스를 보장하고 결과(케이스 id)를 파일·환경변수로 넘긴다.
 *     토큰이 없으면 계정이 이미 있다고 가정한다.
 *  2) 역할 4개로 로그인해 storageState 를 저장한다 → 스펙은 로그인 없이 바로 화면을 연다.
 *     한 역할의 로그인이 실패해도 나머지는 계속 진행하고, 실패한 역할의 스펙은 그 사유를 안고 실패한다.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? process.env.SMOKE_BASE_URL;
  if (!baseURL) throw new Error('SMOKE_BASE_URL 환경변수가 필요합니다. 예) SMOKE_BASE_URL=https://modu-dalgmes-projects.vercel.app');
  if (!SMOKE_PASSWORD) throw new Error('SMOKE_PASSWORD 환경변수가 필요합니다(점검 계정 4개 공통 비밀번호). GitHub Actions 라면 저장소 Secrets 에 SMOKE_PASSWORD 가 비어 있는 것 — docs/SMOKE-TEST.md §4-3.');
  if (EXTRA_HEADERS) console.log('[smoke] VERCEL_AUTOMATION_BYPASS_SECRET 감지 — 모든 요청에 x-vercel-protection-bypass 헤더를 붙입니다.');

  // 1) 시드
  const token = process.env.SMOKE_SEED_TOKEN;
  if (token) {
    const url = new URL('/api/ops/smoke-seed', baseURL).toString();
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(EXTRA_HEADERS ?? {}) } });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; caseId?: string | null; programId?: string; warnings?: string[] } | null;
    if (!res.ok || !body?.ok) {
      throw new Error(`스모크 시드 실패 (${res.status}): ${body?.error ?? '응답 없음'}`);
    }
    writeFileSync(SEED_RESULT_PATH, JSON.stringify({ programId: body.programId, caseId: body.caseId ?? null, warnings: body.warnings ?? [] }, null, 2));
    if (body.caseId) process.env.SMOKE_CASE_ID = body.caseId;
    if (body.warnings?.length) console.warn('[smoke-seed] 경고:', body.warnings.join(' / '));
    console.log(`[smoke-seed] ok program=${body.programId} case=${body.caseId ?? '-'}`);
  } else {
    console.log('[smoke-seed] SMOKE_SEED_TOKEN 없음 — 계정이 이미 있다고 가정합니다.');
    if (existsSync(SEED_RESULT_PATH)) rmSync(SEED_RESULT_PATH);
  }

  // 2) 역할별 로그인 → storageState
  mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch();
  const failures: string[] = [];
  try {
    for (const role of SMOKE_ROLES) {
      const context = await browser.newContext({ baseURL, locale: 'ko-KR', timezoneId: 'Asia/Seoul', extraHTTPHeaders: EXTRA_HEADERS });
      const page = await context.newPage();
      const failedMarker = `${authStatePath(role)}.failed`;
      try {
        await login(page, SMOKE_EMAILS[role], SMOKE_PASSWORD);
        // 허브 자동 진입까지 마친 상태(컨텍스트 쿠키 포함)를 저장한다 — 대시보드 도착을 기다린다
        await page.waitForURL((u) => u.pathname.startsWith(ROLE_HOME[role]) || u.pathname.startsWith('/hub'), { timeout: 45_000 }).catch(() => undefined);
        await context.storageState({ path: authStatePath(role) });
        if (existsSync(failedMarker)) rmSync(failedMarker);
        console.log(`[smoke-login] ${role} ok → ${new URL(page.url()).pathname}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${role}: ${message}`);
        // 스펙이 storageState 파일을 열 수 있도록 빈 상태를 두고, 실패 마커에 사유를 남긴다
        writeFileSync(authStatePath(role), JSON.stringify({ cookies: [], origins: [] }));
        writeFileSync(failedMarker, message);
        console.error(`[smoke-login] ${role} 실패: ${message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length === SMOKE_ROLES.length) {
    throw new Error(`역할 4개 전부 로그인 실패 — 배포 URL·SMOKE_PASSWORD·시드를 확인하세요.\n${failures.join('\n')}`);
  }
}
