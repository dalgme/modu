import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createSignedUrl } from '@/lib/storage/files';
import { ensureMergedPdf, resolvePaymentViewer } from '@/lib/files/mentor-payment';
import { mentorPaymentMergedHref } from '@/lib/files/mentor-payment-shared';
import { recordSecurityEventSafe } from '@/lib/ops/security-events';

export const dynamic = 'force-dynamic';
// 서버리스 콜드스타트 + 여러 파일 내려받아 합치기 (CLAUDE.md §6-4)
export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * 멘토 지급서류 합본 PDF (2026-09-30).
 *  - `?meta=1`     → 미리보기 계약 JSON { name, mime, url(120초 인라인 서명 URL), downloadUrl, textUrl }
 *  - `?download=1` → 반출 기록(보안 이벤트 export) 후 `{멘토명}_지급서류.pdf` 로 내려받는 서명 URL 로 이동
 *  - (없음)        → 인라인 서명 URL 로 이동 (새 창 보기)
 * 합본은 스토리지에 캐시하고 짧은 서명 URL 만 준다 — 응답 본문 4.5MB 한도를 넘지 않는다.
 */
export async function GET(request: Request, { params }: { params: { mentorId: string } }): Promise<Response> {
  const mentorId = params.mentorId;
  if (!UUID.test(mentorId)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  const viewer = await resolvePaymentViewer(mentorId);
  if (!viewer.ok) return NextResponse.json({ error: viewer.error }, { status: viewer.status });

  const merged = await ensureMergedPdf(viewer.programId, mentorId);
  if (!merged.ok) return NextResponse.json({ error: merged.error }, { status: merged.status });

  const { data: u } = await createAdminClient().from('users').select('name').eq('id', mentorId).maybeSingle();
  const fileName = `${u?.name ?? '멘토'}_지급서류.pdf`;
  const sp = new URL(request.url).searchParams;
  const noStore = { 'Cache-Control': 'no-store' };

  if (sp.get('download') === '1') {
    const url = await createSignedUrl('documents', merged.path, 120, fileName);
    if (!url) return NextResponse.json({ error: '파일을 준비하지 못했습니다.' }, { status: 500 });
    await recordSecurityEventSafe({
      kind: 'export',
      severity: 'info',
      userId: viewer.userId,
      path: '/api/files/mentor-payment/merged',
      detail: { route: 'mentor-payment-merged', mentor_id: mentorId, files: merged.mergedCount, program_id: viewer.programId },
    });
    return NextResponse.redirect(url, { status: 302, headers: noStore });
  }

  const url = await createSignedUrl('documents', merged.path, 120);
  if (!url) return NextResponse.json({ error: '파일을 준비하지 못했습니다.' }, { status: 500 });
  if (sp.get('meta') === '1') {
    return NextResponse.json(
      {
        name: fileName,
        mime: 'application/pdf',
        url,
        downloadUrl: mentorPaymentMergedHref(mentorId, 'download'),
        textUrl: null,
        mergedCount: merged.mergedCount,
        skipped: merged.skipped,
      },
      { headers: noStore },
    );
  }
  return NextResponse.redirect(url, { status: 302, headers: noStore });
}
