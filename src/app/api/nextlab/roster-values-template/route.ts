import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { listRosterColumns } from '@/lib/data/roster-columns';
import { listProgramMembers } from '@/lib/data/members';
import { workbookBuffer, xlsxResponse } from '@/lib/excel/sheet';

export const dynamic = 'force-dynamic';

/**
 * 임의 컬럼 업로드 템플릿 (P31) — GET /api/nextlab/roster-values-template?target=mentee|mentor
 * 현재 범위의 회원(이름·휴대폰)과 이 리스트의 임의 컬럼 이름을 헤더로 채워 준다. 값을 적어 [임의 컬럼 업로드]로 올린다.
 */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const target = new URL(request.url).searchParams.get('target') === 'mentor' ? 'mentor' : 'mentee';
  const [roster, members] = await Promise.all([listRosterColumns(ctx.programId), listProgramMembers(ctx.programId, ctx.supportTypeId)]);
  const cols = roster.columns.filter((c) => c.target === target);
  const header = ['이름', '휴대폰', ...cols.map((c) => c.name)];
  const rows = members.filter((m) => m.role === target).map((m) => [m.name, m.phone ?? '', ...cols.map((c) => roster.values[`${c.id}:${m.id}`] ?? '')]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  for (let r = 0; r < Math.max(200, rows.length + 1); r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 1 });
    const existing = ws[addr] as XLSX.CellObject | undefined;
    ws[addr] = { ...(existing ?? { t: 's', v: '' }), z: '@', t: 's' } as XLSX.CellObject;
  }
  ws['!cols'] = header.map((h) => ({ wch: Math.max(12, h.length * 2 + 2) }));
  const guide = XLSX.utils.aoa_to_sheet([
    ['안내'],
    ['· 이름 또는 휴대폰으로 회원을 찾습니다(동명이인은 휴대폰으로 구분). 헤더 이름은 회원 명단의 임의 컬럼 이름과 같아야 합니다.'],
    ['· 값을 비우면 그 셀은 건드리지 않고, "-" 를 적으면 지웁니다. 값은 60자까지.'],
    [`· 현재 범위(${ctx.group ? ctx.group.name : '행사 전체'})의 ${target === 'mentee' ? '멘티' : '멘토'}만 대상입니다.`],
    ...(cols.length === 0 ? [['· 아직 임의 컬럼이 없습니다. 회원 명단에서 먼저 컬럼을 추가하세요.']] : []),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, target === 'mentee' ? '멘티 임의 컬럼' : '멘토 임의 컬럼');
  XLSX.utils.book_append_sheet(wb, guide, '안내');
  return xlsxResponse(workbookBuffer(wb), `${ctx.program.name}_${target === 'mentee' ? '멘티' : '멘토'}_임의컬럼_템플릿.xlsx`);
}
