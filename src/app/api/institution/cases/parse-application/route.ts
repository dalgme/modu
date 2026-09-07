import { NextResponse } from 'next/server';

import { requireStaff } from '@/lib/auth/guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/storage/files';
import { parseApplicationPdf } from '@/lib/documents/parse-application-pdf';

// unpdf(텍스트 추출)는 Node 런타임 필요 + 대용량 신청서 콜드스타트 여유
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

/** 파일명 정리 (경로 구분자 제거, 길이 제한) */
function safeFileName(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop()?.trim() || '사업신청서.pdf';
  return base.slice(0, 120);
}

/**
 * 진흥원: 브라우저에서 스토리지로 직접 업로드된 신청서 PDF(stagingPath)를 서버가 내려받아
 * 텍스트 추출·파싱한다. 대용량 원본은 함수 요청 본문(Vercel ≈4.5MB 한도)을 거치지 않으므로
 * 여기서는 경로만 JSON 으로 받는다.
 * 파싱값이 비어도(스캔본 등) 원본은 이미 스테이징되어 있어 케이스 등록 시 첨부된다.
 */
export async function POST(req: Request): Promise<NextResponse> {
  await requireStaff();

  let body: { stagingPath?: unknown; fileName?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const stagingPath = typeof body.stagingPath === 'string' ? body.stagingPath : '';
  // 스테이징 경로만 허용 (임의 스토리지 경로 열람 차단)
  if (!stagingPath.startsWith('_staging/') || stagingPath.includes('..')) {
    return NextResponse.json({ ok: false, error: '잘못된 파일 경로입니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage.from('documents').download(stagingPath);
  if (error || !blob) {
    return NextResponse.json(
      { ok: false, error: `업로드된 파일을 찾지 못했습니다: ${error?.message ?? ''}`.trim() },
      { status: 404 },
    );
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: '파일이 비어있거나 너무 큽니다. (최대 20MB)' },
      { status: 400 },
    );
  }

  const staging = {
    stagingPath,
    fileName: safeFileName(typeof body.fileName === 'string' ? body.fileName : undefined),
    size: buffer.byteLength,
    sha256: sha256Hex(buffer),
    mimeType: 'application/pdf',
  };

  // 텍스트 추출·파싱 (실패해도 첨부는 유지 → 수기 입력 안내)
  let fields = {};
  let matchedCount = 0;
  let supportTypeCode: 'management_improvement' | 'closure' | undefined;
  try {
    const parsed = await parseApplicationPdf(buffer);
    fields = parsed.fields;
    matchedCount = parsed.matchedCount;
    supportTypeCode = parsed.supportTypeCode;
  } catch {
    // 파싱 실패는 무시 (스캔본/형식 상이) — 원본은 첨부됨
  }

  return NextResponse.json({ ok: true, fields, matchedCount, supportTypeCode, staging });
}
