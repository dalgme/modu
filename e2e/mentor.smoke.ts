import { test } from '@playwright/test';

import { authStatePath, expectHealthyPage, findLinkedId, readSeedInfo, requireAuthState } from './helpers';
import { MENTOR_PAGES, resolvePath } from './pages';

const ROLE = 'mentor' as const;

test.use({ storageState: authStatePath(ROLE) });

test.describe('멘토(mentor) 화면 점검', () => {
  let caseId: string | null = null;

  test.beforeAll(async ({ browser }) => {
    requireAuthState(ROLE);
    caseId = readSeedInfo().caseId ?? null;
    if (!caseId) {
      // 멘토 대시보드의 담당 멘티 카드 링크에서 찾는다
      const context = await browser.newContext({ storageState: authStatePath(ROLE) });
      const page = await context.newPage();
      caseId = await findLinkedId(page, '/mentor/dashboard', '/mentor/cases/');
      await context.close();
    }
  });

  for (const path of MENTOR_PAGES) {
    test(path, async ({ page }) => {
      const resolved = resolvePath(path, caseId);
      test.skip(!resolved, '담당 케이스 id 를 찾지 못해 건너뜀');
      await expectHealthyPage(page, resolved!);
    });
  }
});
