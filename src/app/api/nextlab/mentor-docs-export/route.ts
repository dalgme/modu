import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { listMentorDocStatus } from '@/lib/mentor-docs/data';
import { excelFileName, kstDate, sheetName, sheetWithMeta, workbookBuffer, xlsxResponse } from '@/lib/excel/sheet';

export const dynamic = 'force-dynamic';

/**
 * 멘토 서류 수령 현황 엑셀 (P32) — GET /api/nextlab/mentor-docs-export
 * 현재 범위(행사 전체 | 그룹)의 섹션(스코프)별 시트: 멘토 × 서류(O/–) + 수령일·확인자.
 */
export async function GET(): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });

  const status = await listMentorDocStatus(ctx.programId, ctx.supportTypeId ?? null);
  const sections = status.sections.filter((s) => s.enabled);
  if (sections.length === 0) return NextResponse.json({ error: '이 범위에서 서류 수령 체크를 사용하지 않습니다.' }, { status: 404 });

  const wb = XLSX.utils.book_new();
  const scopeLabel = ctx.group?.name ?? '전체';
  for (const s of sections) {
    const header = ['멘토', ...s.items.map((i) => i.name), '수령/전체', ...s.items.flatMap((i) => [`${i.name} 수령일`, `${i.name} 확인자`]), '비고'];
    const rows = s.mentors.map((m) => [
      m.name,
      ...m.items.map((i) => (i.received ? 'O' : '-')),
      `${m.receivedCount}/${m.total}`,
      ...m.items.flatMap((i) => [i.received ? kstDate(i.receivedAt) : '', i.received ? i.receivedBy ?? '' : '']),
      m.items.map((i) => i.note).filter(Boolean).join(' / '),
    ]);
    const ws = sheetWithMeta(header, rows, { 범위: `${ctx.program.name} · ${s.scope.name}`, extra: [['서류 목록 스코프', s.scope.supportTypeId ? '그룹 전용' : '행사 공통']] });
    XLSX.utils.book_append_sheet(wb, ws, sheetName(s.scope.name));
  }
  return xlsxResponse(workbookBuffer(wb), excelFileName(ctx.program.name, scopeLabel, '멘토 서류 수령'));
}
