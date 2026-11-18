'use server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { saveTopics } from '@/lib/files/report-topics';

/** 브라우저가 읽은 "멘토링 주제" 저장 (2026-11-18) — 운영사·발주처, 컨텍스트 행사의 회차만 */
export async function saveReportTopicsAction(results: { logId: string; path: string; topic: string | null }[]): Promise<{ ok: true; saved: number; skipped: number } | { ok: false; error: string }> {
  const staff = await realRoleOrNull(['nextlab', 'institution']);
  if (!staff) return { ok: false, error: '권한이 없습니다.' };
  const ctx = await contextOrNull(staff);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  if (!Array.isArray(results) || results.length > 200) return { ok: false, error: '잘못된 요청입니다.' };
  try {
    const r = await saveTopics(
      ctx.programId,
      results.map((x) => ({ logId: String(x.logId), path: String(x.path), topic: typeof x.topic === 'string' ? x.topic : null })),
    );
    return { ok: true, ...r };
  } catch (e) {
    console.error('[report-topic] 저장 실패', e instanceof Error ? e.message : e);
    return { ok: false, error: '주제를 저장하지 못했습니다.' };
  }
}
