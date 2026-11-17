import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { buildObservationBundle } from '@/lib/files/observation-bundle';
import { recordSecurityEventSafe } from '@/lib/ops/security-events';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * 라운드 관찰의견서 묶음 목록 (2026-11-17) — `?order=mentor|mentee&group=<라운드 id>`.
 * 운영사·발주처(컨텍스트 행사 안). 브라우저가 이 목록으로 사본을 받아 "운영기관" 칸을 가린 PDF 를 만들고
 * 번호를 붙여 한 폴더 ZIP 으로 묶는다. 반출 기록은 보안 이벤트(export).
 */
export async function GET(request: Request): Promise<Response> {
  const staff = await realRoleOrNull(['nextlab', 'institution']);
  if (!staff) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  const ctx = await contextOrNull(staff);
  if (!ctx) return NextResponse.json({ error: '행사를 먼저 선택하세요.' }, { status: 400 });
  const sp = new URL(request.url).searchParams;
  const order = sp.get('order') === 'mentee' ? 'mentee' : sp.get('order') === 'mentor' ? 'mentor' : null;
  const groupId = sp.get('group') ?? '';
  if (!order || !UUID.test(groupId)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const r = await buildObservationBundle(ctx.programId, groupId, order);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  await recordSecurityEventSafe({
    kind: 'export',
    severity: 'info',
    userId: staff.id,
    path: '/api/files/observation-bundle',
    detail: { route: 'observation-bundle', order, group_id: groupId, files: r.manifest.items.length, program_id: ctx.programId },
  });
  return NextResponse.json(r.manifest, { headers: { 'Cache-Control': 'no-store' } });
}
