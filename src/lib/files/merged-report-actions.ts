'use server';

import { revalidatePath } from 'next/cache';

import { authorizeMergedReport, saveMergedReport } from '@/lib/files/merged-report';

/**
 * 멘티별 회차 보고서 합본 저장 (2026-11-10) — 브라우저가 합쳐 스테이징에 올린 PDF 를 케이스에 1건으로 저장한다.
 * 권한 = 목록 라우트와 같은 authorizeMergedReport (운영사·발주처 컨텍스트 행사 / 활성 담당 멘토).
 */
export async function saveMergedReportAction(input: { caseId: string; stagingPath: string; fingerprint: string; includedRounds: number[] }): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const auth = await authorizeMergedReport(input.caseId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const r = await saveMergedReport({ auth, stagingPath: input.stagingPath, fingerprint: input.fingerprint, includedRounds: Array.isArray(input.includedRounds) ? input.includedRounds.filter((n) => Number.isInteger(n)) : [] });
    if (r.ok) {
      revalidatePath('/nextlab/reports');
      revalidatePath('/institution/reports');
    }
    return r;
  } catch (e) {
    console.error('[merged-report] 저장 실패', e instanceof Error ? e.message : e);
    return { ok: false, error: '합본을 저장하지 못했습니다. 다시 시도해 주세요.' };
  }
}
