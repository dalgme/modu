import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { fileResponse } from '@/lib/http/download';
import { recordSecurityEventSafe } from '@/lib/ops/security-events';
import { buildAllowanceWorkbook } from '@/lib/reports/allowance-workbook';
import { buildMenteeStatusWorkbook } from '@/lib/reports/mentee-status-workbook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * 멘토링 실적 엑셀 (2026-10-27) — GET /api/nextlab/mentoring-export?kind=allowance|mentee&group=
 *  - allowance: 멘토링 수당 산출내역 (총괄·멘토별 요약·회차별 상세·단가표, 수식·색) — 라운드 필수
 *  - mentee: 멘티별 멘토링 현황 (배정 멘토·온/오프라인 회차·시간·아이템·운영사) — group 없으면 행사 전체
 * group 이 없으면 현재 범위 그룹을 쓴다. 운영사·발주처.
 */
export async function GET(request: Request): Promise<Response> {
  const profile = await realRoleOrNull(['nextlab', 'institution']);
  if (!profile) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const ctx = await contextOrNull(profile);
  if (!ctx) return NextResponse.json({ error: 'no_context' }, { status: 400 });
  const sp = new URL(request.url).searchParams;
  const kind = sp.get('kind') === 'mentee' ? 'mentee' : 'allowance';
  const groupId = sp.get('group') || ctx.supportTypeId || null;
  if (kind === 'allowance' && !groupId) return NextResponse.json({ error: '수당 산출내역은 라운드(사업그룹)를 골라야 합니다.' }, { status: 400 });

  const built = kind === 'allowance' ? await buildAllowanceWorkbook(ctx.programId, groupId!) : await buildMenteeStatusWorkbook(ctx.programId, groupId);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
  await recordSecurityEventSafe({ kind: 'export', severity: 'info', userId: profile.id, path: '/api/nextlab/mentoring-export', detail: { route: 'mentoring-export', kind, group_id: groupId, rows: built.rows, program_id: ctx.programId } });
  return fileResponse(built.buffer, built.fileName, XLSX_TYPE);
}
