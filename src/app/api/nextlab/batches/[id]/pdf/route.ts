import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { getBatch } from '@/lib/data/settlements';
import { renderBatchCoverHtml } from '@/lib/settlement/cover';
import { htmlToPdf } from '@/lib/documents/render';
import { contentDisposition } from '@/lib/http/download';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 서버리스 Chromium 콜드스타트 (CLAUDE.md §6-4)

/** (P31) 지급 품의 표지 PDF — 품의 번호·제목·제출일·합계 3종·건별 목록·결재란. 발주처는 제출 이후 품의만 */
export async function GET(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const found = await getBatch(params.id, ctx.programId);
  if (!found) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (ctx.role === 'institution' && found.batch.status === 'draft') return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const html = renderBatchCoverHtml(found.batch, found.items, ctx.branding);
  const inline = new URL(request.url).searchParams.get('download') !== '1';
  const pdf = await htmlToPdf(html);
  const filename = `${ctx.program.name}_${found.batch.title}_지급품의서.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(filename, { inline }),
      'Cache-Control': 'private, no-store',
    },
  });
}
