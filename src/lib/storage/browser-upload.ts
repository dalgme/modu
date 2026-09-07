'use client';

import { createClient } from '@/lib/supabase/client';

export type StagedFile = { stagingPath: string; fileName: string; mimeType: string; size: number };

/**
 * 브라우저 → 스토리지 직접 업로드 (서명 URL). 서버 액션 본문 한도(≈4.5MB)를 우회한다.
 *  - documents 버킷: POST /api/support/upload-url
 *  - photos 버킷   : POST /api/mentoring/photo-upload-url
 * 최종 케이스 폴더 이관·DB 기록은 서버 액션이 `_staging/` 접두를 검증한 뒤 수행한다.
 */
export async function stageUpload(file: File, bucket: 'documents' | 'photos' = 'documents'): Promise<StagedFile> {
  const endpoint = bucket === 'photos' ? '/api/mentoring/photo-upload-url' : '/api/support/upload-url';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; token?: string; error?: string };
  if (!res.ok || !body.ok || !body.path || !body.token) throw new Error(body.error ?? '업로드 URL 발급 실패');
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(body.path, body.token, file, { contentType: file.type || undefined });
  if (error) throw new Error(`업로드 실패: ${error.message}`);
  return { stagingPath: body.path, fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size };
}
