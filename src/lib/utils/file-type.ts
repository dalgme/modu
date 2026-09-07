/**
 * 브라우저가 새 탭에서 '인라인'으로 렌더할 수 있는(웹 미리보기 가능) 형식인지 판정한다.
 * PDF·이미지만 인라인 렌더되고, HWP/HWPX·오피스 문서(doc/xls/ppt) 등은 새 탭을 열어도
 * 브라우저가 렌더하지 못해 그대로 '다운로드'된다. 그래서 이런 형식에는 '미리보기' 대신
 * 다운로드만 제공해 혼란을 줄인다.
 */
export function isWebPreviewable(
  mimeType?: string | null,
  fileNameOrPath?: string | null,
): boolean {
  const m = (mimeType ?? '').toLowerCase();
  if (m === 'application/pdf' || m.startsWith('image/')) return true;
  const n = (fileNameOrPath ?? '').toLowerCase();
  return /\.(pdf|png|jpe?g|gif|webp|bmp|svg)$/.test(n);
}
