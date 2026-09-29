import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createSignedUrl } from '@/lib/storage/files';
import { mentorPaymentFolder, resolvePaymentViewer } from '@/lib/files/mentor-payment';
import { mentorPaymentFileHref } from '@/lib/files/mentor-payment-shared';
import { recordSecurityEventSafe } from '@/lib/ops/security-events';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * 멘토 지급서류 한 건 (2026-09-30).
 *  - `?meta=1`     → 미리보기 계약 JSON { name, mime, url(120초 인라인 서명 URL), downloadUrl, textUrl }
 *  - `?download=1` → 반출 기록 후 원래 파일명으로 내려받는 서명 URL 로 이동
 *  - (없음)        → 인라인 서명 URL 로 이동
 * 권한 = 멘토 기준(resolvePaymentViewer) + 파일이 그 행사·그 멘토 폴더에 있는지 경로까지 확인.
 */
export async function GET(request: Request, { params }: { params: { fileId: string } }): Promise<Response> {
  const fileId = params.fileId;
  if (!UUID.test(fileId)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  const { data: row } = await createAdminClient()
    .from('mentor_payment_files')
    .select('id, program_id, mentor_id, file_name, storage_path, mime_type')
    .eq('id', fileId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  const viewer = await resolvePaymentViewer(row.mentor_id);
  if (!viewer.ok) return NextResponse.json({ error: viewer.error }, { status: viewer.status });
  // 다른 행사의 파일·조작된 경로 차단 (서비스롤 서명은 RLS 를 우회하므로 경로까지 검증)
  if (row.program_id !== viewer.programId || !row.storage_path.startsWith(`${mentorPaymentFolder(row.program_id, row.mentor_id)}/`)) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
  }

  const sp = new URL(request.url).searchParams;
  const noStore = { 'Cache-Control': 'no-store' };
  if (sp.get('download') === '1') {
    const url = await createSignedUrl('documents', row.storage_path, 120, row.file_name);
    if (!url) return NextResponse.json({ error: '파일을 준비하지 못했습니다.' }, { status: 500 });
    await recordSecurityEventSafe({
      kind: 'export',
      severity: 'info',
      userId: viewer.userId,
      path: '/api/files/mentor-payment/file',
      detail: { route: 'mentor-payment-file', mentor_id: row.mentor_id, file_id: row.id, program_id: viewer.programId },
    });
    return NextResponse.redirect(url, { status: 302, headers: noStore });
  }
  const url = await createSignedUrl('documents', row.storage_path, 120);
  if (!url) return NextResponse.json({ error: '파일을 준비하지 못했습니다.' }, { status: 500 });
  if (sp.get('meta') === '1') {
    return NextResponse.json({ name: row.file_name, mime: row.mime_type, url, downloadUrl: mentorPaymentFileHref(row.id, 'download'), textUrl: null }, { headers: noStore });
  }
  return NextResponse.redirect(url, { status: 302, headers: noStore });
}
