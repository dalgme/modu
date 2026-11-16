import { describe, expect, it } from 'vitest';

import { isPdfBytes, pdfOnlyNameError } from './pdf-only';

describe('pdf-only', () => {
  it('PDF 이름만 통과', () => {
    expect(pdfOnlyNameError('보고서.pdf', 'application/pdf')).toBeNull();
    expect(pdfOnlyNameError('보고서.PDF', '')).toBeNull();
    expect(pdfOnlyNameError('보고서.pdf', 'application/octet-stream')).toBeNull();
    expect(pdfOnlyNameError('보고서.hwp', '')).not.toBeNull();
    expect(pdfOnlyNameError('보고서.hwpx', 'application/hwp+zip')).not.toBeNull();
    expect(pdfOnlyNameError('보고서.docx', '')).not.toBeNull();
    expect(pdfOnlyNameError('pdf', '')).not.toBeNull();
    expect(pdfOnlyNameError('보고서.pdf', 'application/x-hwp')).not.toBeNull();
  });
  it('파일 앞 바이트 %PDF- 확인', () => {
    expect(isPdfBytes(new TextEncoder().encode('%PDF-1.7\n...'))).toBe(true);
    expect(isPdfBytes(new Uint8Array([0xef, 0xbb, 0xbf].concat(Array.from(new TextEncoder().encode('%PDF-1.4')))))).toBe(true);
    expect(isPdfBytes(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]))).toBe(false); // HWP 5.0 (CFB)
    expect(isPdfBytes(new TextEncoder().encode('PK\u0003\u0004'))).toBe(false); // HWPX·DOCX (zip)
  });
});
