import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { listSupportTypes } from '@/lib/programs/data';
import { buildTemplate } from '@/lib/import/bulk-import';

export const dynamic = 'force-dynamic';

/** 엑셀 일괄 등록 템플릿 다운로드 — GET /api/nextlab/import-template?kind=mentor|mentee */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const kind = new URL(request.url).searchParams.get('kind') === 'mentor' ? 'mentor' : 'mentee';
  const groups = await listSupportTypes(ctx.programId);
  const buf = buildTemplate(kind, groups.filter((g) => g.status === 'active').map((g) => g.code));
  const filename = encodeURIComponent(`${ctx.program.name}_${kind === 'mentor' ? '멘토' : '멘티'}_일괄등록_템플릿.xlsx`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
