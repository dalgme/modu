'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createSummarySnapshot } from '@/lib/reports/summary';
import type { ReportPeriod } from '@/lib/reports/metrics';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 종합결과리포트 생성 — 운영사 전원(옵저버 포함, 'reports' 권한). period 를 주면 그 기간 집계를 스냅샷에 저장 (P30) */
export async function createSummarySnapshotAction(title?: string, period?: ReportPeriod | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 생성할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'reports');
  if (denied) return { ok: false, error: denied };
  const clean: ReportPeriod | null = period && (period.from || period.to)
    ? { from: period.from && DATE_RE.test(period.from) ? period.from : null, to: period.to && DATE_RE.test(period.to) ? period.to : null }
    : null;
  const r = await createSummarySnapshot(ctx.programId, ctx.supportTypeId ?? null, profile.id, title, clean);
  if (r.ok) revalidatePath('/nextlab/reports/summary');
  return r;
}
