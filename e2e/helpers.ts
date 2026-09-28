import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/** 점검 계정 — 이메일은 시드(`src/lib/ops/smoke-seed.ts`)와 같은 고정값. 비밀번호만 환경변수. */
export const SMOKE_ROLES = ['institution', 'nextlab', 'mentor', 'mentee'] as const;
export type SmokeRole = (typeof SMOKE_ROLES)[number];

export const SMOKE_EMAILS: Record<SmokeRole, string> = {
  institution: 'smoke-institution@modu.test',
  nextlab: 'smoke-nextlab@modu.test',
  mentor: 'smoke-mentor@modu.test',
  mentee: 'smoke-mentee@modu.test',
};

export const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD ?? '';

/** 역할별 로그인 상태(storageState) 저장 위치 — globalSetup 이 만든다. */
export const AUTH_DIR = join(__dirname, '.auth');
export const authStatePath = (role: SmokeRole) => join(AUTH_DIR, `${role}.json`);

/** 시드 결과(케이스 id 등) — globalSetup 이 저장, 스펙이 읽는다. 환경변수 SMOKE_CASE_ID 가 우선. */
export const SEED_RESULT_PATH = join(__dirname, '.smoke-seed.json');

export interface SeedInfo {
  programId?: string;
  caseId?: string | null;
  warnings?: string[];
}

export function readSeedInfo(): SeedInfo {
  if (process.env.SMOKE_CASE_ID) return { caseId: process.env.SMOKE_CASE_ID };
  try {
    if (existsSync(SEED_RESULT_PATH)) return JSON.parse(readFileSync(SEED_RESULT_PATH, 'utf8')) as SeedInfo;
  } catch {
    /* 파일이 깨졌으면 없는 것으로 본다 */
  }
  return {};
}

/** 역할 대시보드 경로 — 로그인 성공 판정(허브 자동 진입 후 도착지) */
export const ROLE_HOME: Record<SmokeRole, string> = {
  institution: '/institution/dashboard',
  nextlab: '/nextlab/dashboard',
  mentor: '/mentor/dashboard',
  mentee: '/mentee/dashboard',
};

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * 로그인 폼(`/login`, input #identifier · #password · 버튼 "로그인")으로 로그인한다.
 * 성공 시 `/hub` → 활성 행사 1개 자동 진입 → 역할 대시보드로 도착한다. 실패(비밀번호 오류·비활성 계정)면 `/login` 에 남는다.
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  if (!password) throw new Error('SMOKE_PASSWORD 환경변수가 비어 있습니다.');
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#identifier').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
  // 서버 액션 → redirect 체인(/hub → /hub/enter → 대시보드). 로그인 페이지를 벗어날 때까지 기다린다.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 45_000 }).catch(async () => {
    const alert = await page.locator('[role="alert"]').first().textContent().catch(() => null);
    throw new Error(`로그인 실패(${email}): ${alert?.trim() || '로그인 페이지에 머물러 있음'}`);
  });
  // 비밀번호 변경 강제·동의 화면으로 빠지면 시드가 잘못된 것 — 바로 알린다
  const path = new URL(page.url()).pathname;
  if (path.startsWith('/change-password')) throw new Error(`로그인 후 비밀번호 변경 화면으로 이동(${email}) — 시드가 must_change_password=false 를 보장해야 합니다.`);
  if (path.startsWith('/mentee/consent')) throw new Error(`로그인 후 동의 화면으로 이동(${email}) — 시드가 privacy_agreed_at 을 채워야 합니다.`);
}

/** 페이지 런타임 오류(pageerror) 수집기 — 페이지마다 한 번 붙인다 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

const FATAL_TEXT = /Application error|server-side exception|client-side exception|Digest:/;

/**
 * 경로로 이동한 뒤 화면이 "건강한지" 판정한다.
 *  (a) 응답 상태 < 400
 *  (b) 본문에 Next.js 오류 화면 문구("Application error", "server-side exception", "Digest:")가 없을 것
 *  (c) 로그인 페이지로 튕기지 않았을 것
 *  (d) 페이지 런타임 오류(pageerror) 0건
 * 리다이렉트(권한 없는 탭 → 대시보드 등)는 정상으로 본다 — 목적은 500·크래시 탐지다.
 */
export async function expectHealthyPage(page: Page, path: string): Promise<void> {
  const errors = collectPageErrors(page);
  const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
  // 스트리밍 RSC/클라이언트 하이드레이션까지 잠깐 기다린다(네트워크 idle 은 폴링 때문에 안 될 수 있어 실패해도 넘어감)
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);

  const status = res?.status() ?? 0;
  expect.soft(status, `${path} 응답 상태`).toBeLessThan(400);

  const finalPath = new URL(page.url()).pathname;
  expect.soft(finalPath, `${path} → 로그인 페이지로 튕김(세션 없음)`).not.toMatch(/^\/login/);

  const body = (await page.locator('body').innerText().catch(() => '')) ?? '';
  const fatal = body.match(FATAL_TEXT);
  expect.soft(fatal, `${path} 오류 화면 문구: ${fatal?.[0] ?? ''}`).toBeNull();

  expect.soft(errors, `${path} 페이지 런타임 오류`).toEqual([]);

  // soft 로 모아서 한 번에 보고 — 하나라도 있으면 여기서 실패로 마감
  if (test.info().errors.length > 0) {
    throw new Error(`${path} 화면 점검 실패 (status=${status}, final=${finalPath}, pageerrors=${errors.length})`);
  }
}

/**
 * 현재 페이지(또는 지정 경로)에서 패턴에 맞는 첫 링크의 UUID 를 찾는다 — 시드 케이스 id 를 못 받았을 때의 대체 경로.
 */
export async function findLinkedId(page: Page, fromPath: string, hrefPrefix: string): Promise<string | null> {
  await page.goto(fromPath, { waitUntil: 'domcontentloaded' });
  const hrefs = await page.locator(`a[href*="${hrefPrefix}"]`).evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''));
  for (const h of hrefs) {
    const idx = h.indexOf(hrefPrefix);
    if (idx < 0) continue;
    const m = h.slice(idx + hrefPrefix.length).match(UUID_RE);
    if (m) return m[0];
  }
  return null;
}

/** 스펙 상단에서 사용 — 로그인 상태 파일이 없으면(globalSetup 로그인 실패) 그 이유를 바로 보여 준다 */
export function requireAuthState(role: SmokeRole): string {
  const file = authStatePath(role);
  const failed = `${file}.failed`;
  if (existsSync(failed)) {
    const reason = readFileSync(failed, 'utf8').trim();
    throw new Error(`[${role}] globalSetup 로그인 실패 — ${reason}`);
  }
  if (!existsSync(file)) {
    throw new Error(`[${role}] 로그인 상태 파일이 없습니다 — globalSetup 이 실행되지 않았습니다 (${file}).`);
  }
  return file;
}
