import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { loadReportData } from '@/lib/reports/page-data';
import { buildReportWorkbook } from '@/lib/reports/export';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 리포트 엑셀 — 운영사·발주처 (행사 컨텍스트 범위) */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const tab = new URL(request.url).searchParams.get('tab') ?? 'overview';
  const { m, cases, settlements } = await loadReportData(ctx.programId, ctx.supportTypeId ?? null);
  const buf = buildReportWorkbook(tab, m, cases, settlements, ctx.program.name);
  const filename = encodeURIComponent(`${ctx.program.name}_리포트_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
