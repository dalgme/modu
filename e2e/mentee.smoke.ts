import { test } from '@playwright/test';

import { authStatePath, expectHealthyPage, requireAuthState } from './helpers';
import { MENTEE_PAGES } from './pages';

const ROLE = 'mentee' as const;

test.use({ storageState: authStatePath(ROLE) });

test.describe('멘티(mentee) 화면 점검', () => {
  test.beforeAll(() => {
    requireAuthState(ROLE);
  });

  for (const path of MENTEE_PAGES) {
    test(path, async ({ page }) => {
      await expectHealthyPage(page, path);
    });
  }
});
