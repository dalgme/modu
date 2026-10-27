import { NextResponse } from 'next/server';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { buildRoundPackage } from '@/lib/files/round-package';
import { recordSecurityEventSafe } from '@/lib/ops/security-events';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * 라운드 제출용 묶음 목록 (2026-10-27) — `?kind=mentor|mentee&group=<라운드 id>`.
 * 운영사·발주처(컨텍스트 행사 안). 브라우저가 이 목록으로 파일을 받아 PDF 로 합치고 ZIP 으로 묶는다.
 * 반출 기록은 보안 이벤트(export).
 */
export async function GET(request: Request): Promise<Response> {
  const staff = await realRoleOrNull(['nextlab', 'institution']);
  if (!staff) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  const ctx = await contextOrNull(staff);
  if (!ctx) return NextResponse.json({ error: '행사를 먼저 선택하세요.' }, { status: 400 });
  const sp = new URL(request.url).searchParams;
  const kind = sp.get('kind') === 'mentee' ? 'mentee' : sp.get('kind') === 'mentor' ? 'mentor' : null;
  const groupId = sp.get('group') ?? '';
  if (!kind || !UUID.test(groupId)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const r = await buildRoundPackage(ctx.programId, groupId, kind);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  await recordSecurityEventSafe({
    kind: 'export',
    severity: 'info',
    userId: staff.id,
    path: '/api/files/round-package',
    detail: { route: 'round-package', kind, group_id: groupId, files: r.fileCount, program_id: ctx.programId },
  });
  return NextResponse.json(r.manifest, { headers: { 'Cache-Control': 'no-store' } });
}
