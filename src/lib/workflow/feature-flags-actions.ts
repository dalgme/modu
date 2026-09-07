'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/auth/guards';
import { saveFeatureFlags, type FeatureFlags } from '@/lib/data/app-settings';

export type SimpleResult = { ok: true } | { ok: false; error: string };

/** 운영사/발주처 관리자: 기능 노출 플래그 저장 */
export async function saveFeatureFlagsAction(input: unknown): Promise<SimpleResult> {
  const profile = await requireStaff();
  const raw = (input ?? {}) as Partial<Record<keyof FeatureFlags, unknown>>;
  const flags: FeatureFlags = {
    formsSelection: !!raw.formsSelection,
    formsChangePayment: !!raw.formsChangePayment,
    supplementRequest: !!raw.supplementRequest,
  };
  await saveFeatureFlags(flags, profile.id);
  revalidatePath('/admin/settings/features');
  return { ok: true };
}
