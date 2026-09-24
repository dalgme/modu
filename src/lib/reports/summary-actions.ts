'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless, isPL } from '@/lib/auth/capabilities';
import { createSummarySnapshot, renameSummarySnapshot, setSummarySnapshotHidden, type SummaryAudience } from '@/lib/reports/summary';
import type { ReportPeriod } from '@/lib/reports/metrics';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function revalidate() {
  revalidatePath('/nextlab/reports/summary');
  revalidatePath('/institution/reports/summary');
}

/**
 * 종합결과리포트 생성 — 운영사 전원(옵저버 포함, 'reports' 권한). period 를 주면 그 기간 집계를 스냅샷에 저장 (P30).
 * (P31) audience 'client' = 발주처 공유용(운영사 멘토 평가 제외) — 발주처 [종합결과리포트] 목록에는 이 구분만 보인다.
 */
export async function createSummarySnapshotAction(title?: string, period?: ReportPeriod | null, audience: SummaryAudience = 'internal'): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 생성할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'reports');
  if (denied) return { ok: false, error: denied };
  const clean: ReportPeriod | null = period && (period.from || period.to)
    ? { from: period.from && DATE_RE.test(period.from) ? period.from : null, to: period.to && DATE_RE.test(period.to) ? period.to : null }
    : null;
  const r = await createSummarySnapshot(ctx.programId, ctx.supportTypeId ?? null, profile.id, title, clean, { audience: audience === 'client' ? 'client' : 'internal' });
  if (r.ok) revalidate();
  return r;
}

/** (P31) 제목 변경 — 메인 담당(PL) */
export async function renameSummarySnapshotAction(id: string, title: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  if (!isPL(ctx.grade)) return { ok: false, error: '리포트 제목 변경은 메인 담당자(PL)만 할 수 있습니다.' };
  const r = await renameSummarySnapshot(id, ctx.programId, profile.id, title ?? '');
  if (r.ok) revalidate();
  return r;
}

/** (P31) 숨김/해제(소프트 삭제) — 메인 담당(PL). 숨긴 리포트는 목록에서 빠지고 기존 링크로는 열린다 */
export async function hideSummarySnapshotAction(id: string, hidden: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  if (!isPL(ctx.grade)) return { ok: false, error: '리포트 숨김·복원은 메인 담당자(PL)만 할 수 있습니다.' };
  const r = await setSummarySnapshotHidden(id, ctx.programId, profile.id, hidden);
  if (r.ok) revalidate();
  return r;
}
