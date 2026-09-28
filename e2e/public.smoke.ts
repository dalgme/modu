import { expect, test } from '@playwright/test';

import { collectPageErrors } from './helpers';
import { PUBLIC_PAGES } from './pages';

// 로그인 없는 화면 — 세션 없이 연다
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('공개 화면·헬스 점검', () => {
  test('/api/health 200 + ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status(), '헬스 응답 상태').toBe(200);
    const body = (await res.json().catch(() => null)) as { ok?: boolean; status?: string } | null;
    // 구 형식({status:'ok'})·신 형식({ok:true}) 모두 허용
    expect(body?.ok === true || body?.status === 'ok', `헬스 본문: ${JSON.stringify(body)}`).toBe(true);
  });

  test('/guide.html 200', async ({ request }) => {
    const res = await request.get('/guide.html');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('<html');
  });

  test('/login 폼 렌더', async ({ page }) => {
    const errors = collectPageErrors(page);
    const res = await page.goto('/login', { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator('#identifier')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
    expect(errors, '로그인 페이지 런타임 오류').toEqual([]);
  });

  for (const path of PUBLIC_PAGES.filter((p) => p !== '/login')) {
    test(`${path} 열림`, async ({ page }) => {
      const errors = collectPageErrors(page);
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(res?.status() ?? 0, `${path} 응답 상태`).toBeLessThan(400);
      const body = (await page.locator('body').innerText().catch(() => '')) ?? '';
      expect(body, `${path} 오류 화면`).not.toMatch(/Application error|server-side exception|client-side exception|Digest:/);
      expect(errors, `${path} 런타임 오류`).toEqual([]);
    });
  }

  test('보호 화면은 로그인으로 유도', async ({ page }) => {
    await page.goto('/nextlab/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => u.pathname.startsWith('/login'), { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toMatch(/^\/login/);
  });
});
