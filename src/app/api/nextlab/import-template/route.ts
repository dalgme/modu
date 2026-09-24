import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { buildTemplate, isImportKind, IMPORT_KIND_LABELS } from '@/lib/import/bulk-import';
import { contentDisposition } from '@/lib/http/download';

export const dynamic = 'force-dynamic';

/** 엑셀 일괄 등록 템플릿 다운로드 — GET /api/nextlab/import-template?kind=mentor|mentee */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const kindRaw = new URL(request.url).searchParams.get('kind');
  const kind = isImportKind(kindRaw) ? kindRaw : 'mentee';
  const buf = buildTemplate(kind);
  const filename = `${ctx.program.name}_${IMPORT_KIND_LABELS[kind]}_일괄등록_템플릿.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': contentDisposition(filename),
    },
  });
}
