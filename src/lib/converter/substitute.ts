/** 원본 문서 행 → 변환 PDF 가 있으면 그 PDF 를 가리키는 행 (이름 확장자도 .pdf) — 합본·제출용 묶음 공용, 중립 */
export function withConvertedPdf<T extends { storage_path: string; doc_name: string; mime_type: string | null }>(d: T, pdfPath: string | undefined): T {
  if (!pdfPath) return d;
  const base = (d.doc_name || 'report').replace(/\.(hwpx?|HWPX?)$/, '');
  return { ...d, storage_path: pdfPath, mime_type: 'application/pdf', doc_name: `${base}.pdf` };
}
