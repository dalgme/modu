import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { buildCampaignExportData } from '@/lib/surveys/campaigns';

export const dynamic = 'force-dynamic';

/** 조사 응답 엑셀 — GET /api/nextlab/survey-export?id={campaignId} · 시트1 응답 요약(문항별) · 시트2 원자료(대상자별) */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const data = await buildCampaignExportData(id, ctx.programId);
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.summary.length ? data.summary : [{ 안내: '문항이 없습니다.' }]), '응답 요약');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.raw.length ? data.raw : [{ 안내: '대상자가 없습니다.' }]), '원자료');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const filename = encodeURIComponent(`${ctx.program.name}_${data.title}_조사응답_${new Date().toISOString().slice(0, 10)}.xlsx`);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
