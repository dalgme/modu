/**
 * 업로드 파일 웹 미리보기 방식 판정 (2026-09-30) — 서버·클라이언트 중립 파일.
 * 모든 업로드 파일은 `/api/files/doc/{id}` 한 경로로 미리보기(inline)·다운로드한다 — 권한 확인은 그 라우트가 한다.
 */
export type PreviewKind = 'pdf' | 'image' | 'docx' | 'hwp' | 'hwpx' | 'sheet' | 'text' | 'none';

export function fileExt(name: string | null | undefined): string {
  const n = (name ?? '').trim().toLowerCase();
  const dot = n.lastIndexOf('.');
  return dot > 0 ? n.slice(dot + 1) : '';
}

export function previewKind(name: string | null | undefined, mime?: string | null): PreviewKind {
  const ext = fileExt(name);
  const m = (mime ?? '').toLowerCase();
  if (ext === 'pdf' || m === 'application/pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext) || m.startsWith('image/')) return 'image';
  if (ext === 'docx') return 'docx';
  if (ext === 'hwp') return 'hwp';
  if (ext === 'hwpx') return 'hwpx';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet';
  if (['txt', 'md'].includes(ext) || m.startsWith('text/plain')) return 'text';
  return 'none';
}

/** 미리보기(inline) / 다운로드 주소 — 권한 확인 라우트 */
export function docFileHref(docId: string, mode: 'inline' | 'download'): string {
  return `/api/files/doc/${encodeURIComponent(docId)}${mode === 'inline' ? '?inline=1' : ''}`;
}

/** 형식별 안내 — 미리보기 창 하단 */
export const PREVIEW_NOTES: Partial<Record<PreviewKind, string>> = {
  hwp: '한글(HWP) 문서를 브라우저에서 그린 미리보기입니다. 복잡한 표·그림은 원본과 다르게 보일 수 있으니 정확한 내용은 [다운로드]로 확인하세요.',
  hwpx: '한글(HWPX) 문서는 글자만 미리 보여 줍니다(표 모양·그림 제외). 원본은 [다운로드]로 확인하세요.',
  docx: 'Word 문서를 브라우저에서 그린 미리보기입니다. 일부 서식은 원본과 다를 수 있습니다.',
  sheet: '엑셀 파일의 첫 번째 시트를 표로 보여 줍니다.',
};
