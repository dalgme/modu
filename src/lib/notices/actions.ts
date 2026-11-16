'use server';

import { getRealSessionProfile, getSessionProfile } from '@/lib/auth/guards';
import { getImpersonation } from '@/lib/auth/impersonation';
import { contextOrNull } from '@/lib/programs/context';
import { markNoticeRead, MENTOR_PDF_ONLY_NOTICE_KEY } from '@/lib/notices/one-time';

const ALLOWED_KEYS = new Set([MENTOR_PDF_ONLY_NOTICE_KEY]);

/** 안내 팝업 [확인] — 본인 로그인일 때만 읽음 기록(대행 중에는 기록하지 않는다) */
export async function ackNoticeAction(key: string): Promise<{ ok: boolean }> {
  if (!ALLOWED_KEYS.has(key)) return { ok: false };
  if (await getImpersonation()) return { ok: false };
  const [real, eff] = await Promise.all([getRealSessionProfile(), getSessionProfile()]);
  if (!real || !eff || real.id !== eff.id) return { ok: false };
  const ctx = await contextOrNull(eff);
  return markNoticeRead(real.id, key, ctx?.programId ?? null);
}
