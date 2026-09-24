/**
 * 다운로드 파일명 공용 규칙 (P33).
 *  - 한글 파일명은 RFC 5987 `filename*=UTF-8''…` 로 보내고, 그 헤더를 못 읽는 브라우저·앱(구형 사파리, 일부 인앱 브라우저·다운로드 관리자)을 위해
 *    ASCII 폴백 `filename="…"` 을 함께 붙인다. 폴백만 있으면 한글이 깨지고, filename* 만 있으면 파일명이 라우트 이름(export, route)이 된다.
 *  - `encodeURIComponent` 는 `'()*!` 를 인코딩하지 않는데 RFC 5987 에서는 예약 문자라 품의 제목의 괄호가 헤더 파싱을 깨뜨린다 → 추가 인코딩.
 *  - 파일 시스템 금지 문자(`/ \ : * ? " < > |`)·제어 문자·연속 공백은 파일명 단계에서 정리한다.
 * 서버 라우트·클라이언트 공용(순수 함수).
 */

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** 파일 시스템에 안전한 파일명 — 금지 문자 제거, 공백 정리, 길이 제한(확장자 유지) */
export function safeFileName(raw: string, maxLength = 150): string {
  const cleaned = raw.normalize('NFC').replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  if (cleaned.length <= maxLength) return cleaned || 'download';
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 && cleaned.length - dot <= 6 ? cleaned.slice(dot) : '';
  const base = (ext ? cleaned.slice(0, dot) : cleaned).slice(0, Math.max(1, maxLength - ext.length)).trim();
  return `${base}${ext}` || 'download';
}

/** RFC 5987 ext-value 인코딩 — encodeURIComponent 가 남기는 `'()*!` 까지 퍼센트 인코딩 */
export function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** ASCII 폴백 파일명 — 비 ASCII 는 제거하고, 남는 것이 없으면 download.<ext> */
export function asciiFallback(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot).replace(/[^A-Za-z0-9.]/g, '') : '';
  const base = (dot > 0 ? filename.slice(0, dot) : filename)
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/_{2,}/g, '_')
    .replace(/^[\s_.-]+|[\s_.-]+$/g, '')
    .trim();
  return `${base || 'download'}${ext}`;
}

/** Content-Disposition 헤더 값 — `attachment; filename="ascii"; filename*=UTF-8''한글` */
export function contentDisposition(filename: string, opts: { inline?: boolean } = {}): string {
  const safe = safeFileName(filename);
  const type = opts.inline ? 'inline' : 'attachment';
  return `${type}; filename="${asciiFallback(safe)}"; filename*=UTF-8''${rfc5987(safe)}`;
}

export const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  html: 'text/html; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
} as const;

/** 파일 Response 공용 — 파일명 헤더 규칙 적용. CSV 는 엑셀이 한글을 제대로 읽도록 UTF-8 BOM 을 붙인다 */
export function fileResponse(body: Buffer | Uint8Array | string, filename: string, contentType: string, opts: { inline?: boolean } = {}): Response {
  let payload: BodyInit = typeof body === 'string' ? body : new Blob([new Uint8Array(body)]);
  if (contentType.startsWith('text/csv') && typeof payload === 'string' && !payload.startsWith('\ufeff')) payload = `\ufeff${payload}`;
  return new Response(payload, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': contentDisposition(filename, opts),
      'Cache-Control': 'private, no-store',
    },
  });
}
