import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSummarySnapshot } from '@/lib/reports/summary';
import { exportSummary, SUMMARY_FORMATS, type SummaryFormat } from '@/lib/reports/summary-export';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // PDF (서버리스 Chromium)

/** 종합결과리포트 내보내기 — html·pdf·docx·xlsx·pptx. 운영사(옵저버 포함)·발주처, 행사 컨텍스트 범위 */
export async function GET(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const url = new URL(request.url);
  const format = (url.searchParams.get('format') ?? 'html') as SummaryFormat;
  const spec = SUMMARY_FORMATS.find((f) => f.key === format);
  if (!spec) return NextResponse.json({ error: 'bad_format' }, { status: 400 });
  const snap = await getSummarySnapshot(params.id);
  if (!snap || snap.programId !== ctx.programId) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const buf = await exportSummary(snap, format);
  const inline = url.searchParams.get('inline') === '1' && (format === 'html' || format === 'pdf');
  if (!inline) {
    await createAdminClient().from('audit_logs').insert({ actor_id: profile.id, program_id: ctx.programId, action: 'report.export', entity_type: 'report_snapshots', entity_id: snap.id, metadata: { format, title: snap.title } });
  }
  const filename = encodeURIComponent(`${snap.title}.${spec.ext}`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': spec.mime,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
