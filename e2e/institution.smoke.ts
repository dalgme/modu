import { test } from '@playwright/test';

import { authStatePath, expectHealthyPage, findLinkedId, readSeedInfo, requireAuthState } from './helpers';
import { INSTITUTION_PAGES, resolvePath } from './pages';

const ROLE = 'institution' as const;

test.use({ storageState: authStatePath(ROLE) });

test.describe('발주처(institution) 화면 점검', () => {
  let caseId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    requireAuthState(ROLE);
    caseId = readSeedInfo().caseId ?? null;
    if (!caseId) {
      const context = await browser.newContext({ storageState: authStatePath(ROLE) });
      const page = await context.newPage();
      caseId = await findLinkedId(page, '/institution/reports?tab=cases', '/institution/cases/');
      await context.close();
    }
  });

  for (const path of INSTITUTION_PAGES) {
    test(path, async ({ page }) => {
      const resolved = resolvePath(path, caseId);
      test.skip(!resolved, '케이스 id 를 찾지 못해 건너뜀');
      await expectHealthyPage(page, resolved!);
    });
  }
});
