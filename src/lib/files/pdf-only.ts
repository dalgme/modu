/**
 * (2026-11-16) 멘토가 올리는 멘토링 보고서·관찰의견서는 PDF 파일만 받는다.
 * 화면(파일 선택 accept·안내 문구)과 서버(이름·MIME·파일 앞 바이트) 가 이 파일 하나를 읽는다 — 중립 파일(서버·클라이언트 공용).
 * 이미 올라온 한글·Word 파일은 그대로 둔다(열람·합본 등 기존 동작 유지). 새로 올리거나 수정 업로드할 때만 적용.
 */

/** 파일 선택 창 필터 */
export const PDF_ACCEPT = 'application/pdf,.pdf';

/** 업로드 칸 옆 안내 문구 */
export const PDF_ONLY_NOTICE = 'PDF파일만 업로드 가능';

export const PDF_ONLY_DETAIL = '한글(HWP·HWPX)·Word 파일은 프로그램에서 [PDF로 저장]한 뒤 그 PDF 파일을 올려 주세요.';

export const PDF_ONLY_ERROR = `${PDF_ONLY_NOTICE}합니다. ${PDF_ONLY_DETAIL}`;

/** 이름·MIME 검사 — 확장자 .pdf + (MIME 이 비었거나 octet-stream 이거나 application/pdf) */
export function pdfOnlyNameError(fileName: string, mimeType?: string | null): string | null {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  if (!fileName.includes('.') || ext !== 'pdf') return PDF_ONLY_ERROR;
  const mime = (mimeType ?? '').toLowerCase();
  if (mime && mime !== 'application/octet-stream' && mime !== 'application/pdf' && mime !== 'application/x-pdf') return PDF_ONLY_ERROR;
  return null;
}

/** 파일 앞 바이트 검사 — 이름만 .pdf 로 바꾼 한글 파일 등을 거른다 (앞 1KB 안에 %PDF-) */
export function isPdfBytes(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 1024);
  for (let i = 0; i + 4 < n; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) return true;
  }
  return false;
}
