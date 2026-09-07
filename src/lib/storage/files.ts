import 'server-only';
import { createHash, randomUUID } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';

export type BucketId = 'documents' | 'signatures' | 'photos';

export interface UploadedFileMeta {
  storagePath: string;
  sha256: string;
  size: number;
  mimeType: string;
}

/** 버퍼의 SHA-256 16진 해시 */
export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 비공개 버킷에 파일 업로드 (service_role). 접근 권한은 호출부에서 사전 검증한다.
 * 경로: {bucket}/{caseId}/{uuid}.{ext}
 */
export async function uploadFile(
  bucket: BucketId,
  caseId: string,
  buffer: Buffer,
  contentType: string,
  ext: string,
): Promise<UploadedFileMeta> {
  const admin = createAdminClient();
  const storagePath = `${caseId}/${randomUUID()}.${ext}`;
  const { error } = await admin.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(`파일 업로드 실패(${bucket}): ${error.message}`);
  }
  return {
    storagePath,
    sha256: sha256Hex(buffer),
    size: buffer.byteLength,
    mimeType: contentType,
  };
}

/**
 * 버킷 내에서 파일 경로를 이동한다 (스테이징 → 케이스 폴더 등). service_role.
 * 접근 권한은 호출부에서 사전 검증한다.
 */
export async function moveFile(bucket: BucketId, fromPath: string, toPath: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).move(fromPath, toPath);
  if (error) {
    throw new Error(`파일 이동 실패(${bucket}): ${error.message}`);
  }
}

/** data:image/png;base64,... 형태의 서명 이미지를 버퍼로 변환 */
export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mimeType: match[1]!, buffer: Buffer.from(match[2]!, 'base64') };
}

/**
 * 비공개 파일을 내려받아 data:URI(base64)로 반환한다.
 * 서버사이드 PDF 렌더 시 이미지(사진·서명)를 HTML 에 인라인 삽입하는 용도.
 * 실패 시 null.
 */
export async function downloadDataUrl(
  bucket: BucketId,
  storagePath: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(storagePath);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mime = data.type || 'image/png';
  return `data:${mime};base64,${base64}`;
}

/**
 * 비공개 파일 접근용 signed URL 발급 (기본 5분).
 * download 이 true 면 브라우저가 바로 내려받도록 Content-Disposition: attachment 로 서명한다.
 * download 에 문자열(파일명)을 주면 그 파일명으로 내려받도록 한다(원본 파일명 유지).
 */
export async function createSignedUrl(
  bucket: BucketId,
  storagePath: string,
  expiresInSeconds = 300,
  download: boolean | string = false,
): Promise<string | null> {
  const opts =
    typeof download === 'string' && download.trim()
      ? { download: download.trim() }
      : download
        ? { download: true }
        : undefined;
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresInSeconds, opts);
  return data?.signedUrl ?? null;
}

/**
 * 케이스 폴더 범위로 제한된 signed URL 발급.
 * storage_path 는 {caseId}/{uuid}.{ext} 규약이므로, 경로가 해당 케이스 폴더로 시작하지 않으면
 * (다른 케이스 파일을 가리키도록 조작된 경우) 서명을 거부한다. service_role 서명이 RLS 를
 * 우회하므로, 행(RLS)이 아니라 경로(필드값)까지 검증해 케이스 간 파일 열람을 차단한다.
 */
export async function createCaseScopedSignedUrl(
  bucket: BucketId,
  caseId: string,
  storagePath: string,
  expiresInSeconds = 300,
  download: boolean | string = false,
): Promise<string | null> {
  if (!caseId || !storagePath.startsWith(`${caseId}/`)) return null;
  return createSignedUrl(bucket, storagePath, expiresInSeconds, download);
}
