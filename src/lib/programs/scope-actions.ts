'use server';

import { revalidatePath } from 'next/cache';

import { getSessionProfile } from '@/lib/auth/guards';
import { contextOrNull, writeContextCookie } from '@/lib/programs/context';
import { getSupportType } from '@/lib/programs/data';

type Result = { ok: true } | { ok: false; error: string };

/**
 * 범위 전환 (P25) — 현재 행사 안에서 "행사 전체 ↔ 특정 그룹"을 화면 이탈 없이 바꾼다.
 * 허브를 거치지 않고 컨텍스트 쿠키의 그룹만 교체한다. 쿠키 소유자는 유효 신원(대행 중이면 대상)이다.
 */
export async function switchScopeAction(groupId: string | null): Promise<Result> {
  const profile = await getSessionProfile();
  if (!profile) return { ok: false, error: '로그인이 필요합니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  if (ctx.role !== 'nextlab' && ctx.role !== 'institution') return { ok: false, error: '운영사·발주처 담당자만 범위를 바꿀 수 있습니다.' };
  if (groupId) {
    const g = await getSupportType(groupId);
    if (!g || g.program_id !== ctx.programId) return { ok: false, error: '이 행사의 사업그룹이 아닙니다.' };
  }
  if (!writeContextCookie(profile.id, ctx.programId, groupId)) return { ok: false, error: '범위를 저장하지 못했습니다.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}
