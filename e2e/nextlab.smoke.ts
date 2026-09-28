import { test } from '@playwright/test';

import { authStatePath, expectHealthyPage, findLinkedId, readSeedInfo, requireAuthState } from './helpers';
import { NEXTLAB_PAGES, resolvePath } from './pages';

const ROLE = 'nextlab' as const;

test.use({ storageState: authStatePath(ROLE) });

test.describe('운영사(nextlab) 화면 점검', () => {
  let caseId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    requireAuthState(ROLE);
    caseId = readSeedInfo().caseId ?? null;
    if (!caseId) {
      // 시드 응답이 없으면 멘티 명단의 케이스 링크에서 찾는다
      const context = await browser.newContext({ storageState: authStatePath(ROLE) });
      const page = await context.newPage();
      caseId = await findLinkedId(page, '/nextlab/roster?tab=mentee', '/nextlab/cases/');
      await context.close();
    }
  });

  for (const path of NEXTLAB_PAGES) {
    test(path, async ({ page }) => {
      const resolved = resolvePath(path, caseId);
      test.skip(!resolved, '케이스 id 를 찾지 못해 건너뜀 (시드 토큰 또는 멘티 명단의 케이스 필요)');
      await expectHealthyPage(page, resolved!);
    });
  }
});
