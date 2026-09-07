import { requireUser } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { renderMentoringLogPdf } from '@/lib/workflow/consulting-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 멘토링 일지(회차) '출력 원본' PDF 다운로드.
 * 접근 권한은 RLS(can_access_case)로 검증한다 — 스코프 클라이언트로 일지 조회가 되면 접근 허용.
 */
export async function GET(_req: Request, { params }: { params: { id: string; logId: string } }) {
  await requireUser();
  const supabase = createClient();
  const { data: log } = await supabase
    .from('mentoring_logs')
    .select('id')
    .eq('id', params.logId)
    .eq('case_id', params.id)
    .maybeSingle();
  if (!log) return new Response('접근 권한이 없거나 일지를 찾을 수 없습니다.', { status: 404 });

  const pdf = await renderMentoringLogPdf(params.id, params.logId);
  if (!pdf) return new Response('PDF 생성에 실패했습니다. 잠시 후 다시 시도하세요.', { status: 500 });

  const filename = encodeURIComponent('멘토링일지.pdf');
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'Cache-Control': 'no-store',
    },
  });
}
