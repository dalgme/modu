import { NextResponse } from 'next/server';

import { realRoleOrNull, roleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildReportBundle, type BundleScope } from '@/lib/files/report-bundle';
import { recordSecurityEventSafe } from '@/lib/ops/security-events';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 컨설팅 보고서·관찰의견서 묶음(ZIP) 목록 (2026-09-30) — 브라우저가 이 목록으로 파일을 받아 ZIP 을 만든다.
 * `?scope=case|mentor|group&id=…[&mentor=…]`
 *  - 발주처·운영사: 컨텍스트 행사 안 전부
 *  - 멘토: 본인이 배정됐거나 회차를 진행한 케이스(case), 본인 폴더(mentor=본인) — 라운드 전체(group)는 불가
 * 반출 기록은 보안 이벤트(export)로 남긴다(대량 반출 감지, P35).
 */
export async function GET(request: Request): Promise<Response> {
  const sp = new URL(request.url).searchParams;
  const scope = sp.get('scope') as BundleScope | null;
  const id = sp.get('id') ?? '';
  const mentorId = sp.get('mentor') || null;
  if (!scope || !['case', 'mentor', 'group'].includes(scope) || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  if (mentorId && !/^[0-9a-f-]{36}$/i.test(mentorId)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  let programId: string | null = null;
  let userId: string | null = null;
  const staff = await realRoleOrNull(['nextlab', 'institution']);
  if (staff) {
    const ctx = await contextOrNull(staff);
    if (ctx) {
      programId = ctx.programId;
      userId = staff.id;
    }
  }
  if (!programId) {
    const mentor = await roleOrNull(['mentor']);
    if (!mentor) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    const ctx = await contextOrNull(mentor);
    if (!ctx) return NextResponse.json({ error: '행사를 먼저 선택하세요.' }, { status: 400 });
    if (scope === 'group') return NextResponse.json({ error: '라운드 전체 받기는 운영사·발주처만 할 수 있습니다.' }, { status: 403 });
    if (scope === 'mentor' && id !== mentor.id) return NextResponse.json({ error: '본인 담당 멘티만 받을 수 있습니다.' }, { status: 403 });
    if (scope === 'case') {
      const admin = createAdminClient();
      const [{ count: a }, { count: l }] = await Promise.all([
        admin.from('mentor_assignments').select('id', { count: 'exact', head: true }).eq('case_id', id).eq('mentor_id', mentor.id),
        admin.from('mentoring_logs').select('id', { count: 'exact', head: true }).eq('case_id', id).eq('mentor_id', mentor.id),
      ]);
      if ((a ?? 0) + (l ?? 0) === 0) return NextResponse.json({ error: '담당 멘티가 아닙니다.' }, { status: 403 });
    }
    programId = ctx.programId;
    userId = mentor.id;
  }

  const r = await buildReportBundle({ programId, scope, id, mentorId });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 404 });
  await recordSecurityEventSafe({
    kind: 'export',
    severity: 'info',
    userId,
    path: '/api/files/report-bundle',
    detail: { route: 'report-bundle', scope, target_id: id, files: r.manifest.files.length, program_id: programId },
  });
  return NextResponse.json(r.manifest, { headers: { 'Cache-Control': 'no-store' } });
}
