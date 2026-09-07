import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { getBatch } from '@/lib/data/settlements';
import { buildBatchWorkbook } from '@/lib/settlement/export';

export const dynamic = 'force-dynamic';

/** 지급 품의서 엑셀 — 운영사·발주처 (행사 컨텍스트 범위) */
export async function GET(_request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const found = await getBatch(params.id, ctx.programId);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const buf = buildBatchWorkbook(found.batch, found.items, ctx.program.name);
  const filename = encodeURIComponent(`${ctx.program.name}_${found.batch.title}_지급품의.xlsx`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
