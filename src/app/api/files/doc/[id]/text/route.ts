import { NextResponse } from 'next/server';

import { resolveDocAccess } from '@/lib/files/access';
import type { PreviewText } from '@/lib/files/preview-kind';
import { extractText } from '@/lib/files/text-extract';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 원본 크기 상한 — 이보다 크면 글자 추출을 하지 않는다 */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** 응답 글자 상한(한글 기준 약 2MB) — 넘으면 앞부분만 보낸다 */
const MAX_TEXT_CHARS = 700_000;

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * 업로드 문서 글자 추출 미리보기 (2026-09-30) — `GET /api/files/doc/{id}/text` → `PreviewText` { paragraphs, note? }
 * 브라우저가 직접 그리지 못하는 한글 HWP(브라우저 렌더 실패 시)·Word 97~2003 DOC 의 대체 미리보기.
 * 권한은 미리보기와 같다(`resolveDocAccess`) — 미리보기 전용(다운로드 차단) 파일도 화면 표시용 글자는 준다.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const access = await resolveDocAccess(params.id);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.status === 401 ? 'unauthorized' : access.status === 404 ? 'not_found' : 'forbidden' },
      { status: access.status, headers: NO_STORE },
    );
  }
  const { data, error } = await createAdminClient().storage.from(access.doc.bucket).download(access.doc.path);
  if (error || !data) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  if (data.size > MAX_SOURCE_BYTES) {
    const body: PreviewText = { paragraphs: [], note: '파일이 커서(25MB 초과) 글자 미리보기를 만들지 않았습니다.' };
    return NextResponse.json(body, { headers: NO_STORE });
  }
  const result = await extractText(Buffer.from(await data.arrayBuffer()), access.doc.name);

  const paragraphs: string[] = [];
  let total = 0;
  let truncated = false;
  for (const p of result.paragraphs) {
    if (total + p.length > MAX_TEXT_CHARS) {
      truncated = true;
      break;
    }
    paragraphs.push(p);
    total += p.length;
  }
  const notes = [result.note, truncated ? '문서가 길어 앞부분만 보여 줍니다.' : null].filter(Boolean);
  const body: PreviewText = { paragraphs, ...(notes.length ? { note: notes.join(' ') } : {}) };
  return NextResponse.json(body, { headers: NO_STORE });
}
