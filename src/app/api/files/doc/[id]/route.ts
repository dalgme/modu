import { NextResponse } from 'next/server';

import { resolveDocAccess } from '@/lib/files/access';
import { docFileHref, type PreviewMeta } from '@/lib/files/preview-kind';
import { createSignedUrl } from '@/lib/storage/files';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** 다운로드가 막힌 파일을 주소로 직접 연 경우 — 브라우저 이동이면 안내 화면, 그 외는 JSON */
function downloadBlocked(request: Request): Response {
  if ((request.headers.get('accept') ?? '').includes('text/html')) {
    return new Response(
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>다운로드 제한</title></head>' +
        '<body style="font-family:sans-serif;padding:2rem;line-height:1.6"><h1 style="font-size:1.1rem">다운로드가 제한된 문서입니다</h1>' +
        '<p>이 문서는 보안 정책에 따라 플랫폼 화면의 [미리보기]로만 볼 수 있습니다. 다운로드·인쇄가 필요하면 운영 담당자에게 문의하세요.</p></body></html>',
      { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } },
    );
  }
  return NextResponse.json({ error: 'download_blocked' }, { status: 403, headers: NO_STORE });
}

/**
 * 업로드 파일 미리보기·다운로드 (2026-09-30) — 권한 확인(`resolveDocAccess`) 후 짧은 서명 URL 을 준다.
 *  - `?meta=1`   : 미리보기 계약 JSON `PreviewMeta` { name, mime, url, downloadUrl, textUrl }
 *                  url = 인라인 서명 URL(다운로드 가능 120초 · 미리보기 전용 60초, download 파라미터 없음) — 미리보기 창이 바이트를 직접 읽는다
 *                  downloadUrl = 이 라우트(다운로드) 또는 null(다운로드·인쇄 차단) · textUrl = 서버 글자 추출 라우트
 *  - `?inline=1` : (하위 호환) 인라인 서명 URL 로 302. 미리보기 전용 파일은 403 — 새 창 원본 열기도 다운로드 경로라서
 *  - 기본        : 저장된 파일명(doc_name)으로 다운로드(302). 미리보기 전용 파일은 403
 * 서명 URL 은 Supabase 스토리지(다른 출처)라 브라우저 fetch 는 스토리지의 CORS(Access-Control-Allow-Origin: *)에 기대고,
 * 이 라우트를 fetch 로 거쳐 302 를 따라가지 않도록(리다이렉트+CORS 조합 실패 방지) 미리보기 창은 meta 의 url 을 직접 읽는다.
 */
export async function GET(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const access = await resolveDocAccess(params.id);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 401 ? 'unauthorized' : access.status === 404 ? 'not_found' : 'forbidden' },
      { status: access.status, headers: NO_STORE },
    );
  }
  const q = new URL(request.url).searchParams;
  const { doc, downloadable } = access;

  if (q.get('meta') === '1') {
    const url = await createSignedUrl(doc.bucket, doc.path, downloadable ? 120 : 60, false);
    if (!url) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    const meta: PreviewMeta = {
      name: doc.name,
      mime: doc.mime,
      url,
      downloadUrl: downloadable ? docFileHref(doc.id, 'download') : null,
      textUrl: docFileHref(doc.id, 'text'),
    };
    return NextResponse.json(meta, { headers: NO_STORE });
  }

  if (!downloadable) return downloadBlocked(request);
  const inline = q.get('inline') === '1';
  const url = await createSignedUrl(doc.bucket, doc.path, 120, inline ? false : doc.name);
  if (!url) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
}
