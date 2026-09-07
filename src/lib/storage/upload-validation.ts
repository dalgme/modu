import 'server-only';

import type { UploadedDoc } from '@/lib/workflow/contractor';

/** 파일당 최대 업로드 크기 (10MB) — 스토리지 남용/DoS 방지 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 허용 MIME → 저장 확장자 */
const ALLOWED = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/webp', 'webp'],
]);

/** 파일 앞부분의 매직바이트로 실제 형식을 판별 (Content-Type 위조 차단). */
function sniffExt(buf: Buffer): string | null {
  // PDF 는 선행 공백/BOM 이 있을 수 있어 앞 1KB 내에서 %PDF 탐색
  if (buf.subarray(0, 1024).includes('%PDF')) return 'pdf';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}

export interface CollectResult {
  ok: boolean;
  docs?: Record<string, UploadedDoc[]>;
  error?: string;
}

/**
 * FormData 의 doc__{key} 파일들을 검증·수집한다.
 * 검증: 파일당 최대 10MB, 허용 형식(PDF·PNG·JPEG·WEBP), 매직바이트가 선언 형식과 일치.
 * 위반 시 첫 오류를 반환한다(부분 저장 방지).
 */
export async function collectValidatedDocs(
  formData: FormData,
  prefix = 'doc__',
): Promise<CollectResult> {
  const docs: Record<string, UploadedDoc[]> = {};
  for (const key of Array.from(new Set(Array.from(formData.keys())))) {
    if (!key.startsWith(prefix)) continue;
    const files = formData.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) continue;

    const collected: UploadedDoc[] = [];
    for (const f of files) {
      const label = f.name || '파일';
      if (f.size > MAX_UPLOAD_BYTES) {
        return { ok: false, error: `${label}: 파일이 너무 큽니다. (최대 10MB)` };
      }
      const mime = (f.type || '').toLowerCase();
      const ext = ALLOWED.get(mime);
      if (!ext) {
        return { ok: false, error: `${label}: 허용되지 않는 형식입니다. (PDF·이미지만 가능)` };
      }
      const buffer = Buffer.from(await f.arrayBuffer());
      if (sniffExt(buffer) !== ext) {
        return { ok: false, error: `${label}: 파일 내용이 형식과 일치하지 않습니다.` };
      }
      collected.push({ buffer, mimeType: mime, ext });
    }
    docs[key.slice(prefix.length)] = collected;
  }
  return { ok: true, docs };
}
