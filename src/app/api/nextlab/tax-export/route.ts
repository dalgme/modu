import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { buildTaxWorkbook, computeTaxSummary } from '@/lib/settlement/tax';
import { contentDisposition } from '@/lib/http/download';

export const dynamic = 'force-dynamic';

/** (P31) 원천세 집계 엑셀 — 운영사·발주처, 행사 컨텍스트 범위(그룹 범위 반영), ?year=YYYY */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const y = new URL(request.url).searchParams.get('year');
  const year = y && /^\d{4}$/.test(y) ? Number(y) : null;
  const t = await computeTaxSummary(ctx.programId, ctx.supportTypeId ?? null, year);
  const buf = buildTaxWorkbook(t, ctx.program.name, ctx.group?.name ?? null);
  const filename = `${ctx.program.name}_원천세집계${year ? `_${year}` : ''}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    },
  });
}
