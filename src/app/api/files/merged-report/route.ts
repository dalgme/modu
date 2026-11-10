import { NextResponse } from 'next/server';

import { authorizeMergedReport, buildMergedReportPlan } from '@/lib/files/merged-report';
import { recordSecurityEventSafe } from '@/lib/ops/security-events';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 멘티별 회차 보고서 합본 — 합치기 목록 (2026-11-10) `?case=<케이스 id>`.
 * 운영사·발주처(컨텍스트 행사) 또는 그 케이스의 활성 담당 멘토. 브라우저가 이 목록의 파일을 회차 순서로 PDF 한 개로 합친 뒤
 * 스테이징에 올리고 saveMergedReportAction 으로 저장한다. 반출 기록은 보안 이벤트(export).
 */
export async function GET(request: Request): Promise<Response> {
  const caseId = new URL(request.url).searchParams.get('case') ?? '';
  const auth = await authorizeMergedReport(caseId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const r = await buildMergedReportPlan(auth.caseRow);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  await recordSecurityEventSafe({
    kind: 'export',
    severity: 'info',
    userId: auth.actor.id,
    path: '/api/files/merged-report',
    detail: { route: 'merged-report', case_id: caseId, files: r.plan.parts.length, program_id: auth.caseRow.program_id },
  });
  return NextResponse.json(r.plan, { headers: { 'Cache-Control': 'no-store' } });
}
