import { describe, expect, it } from 'vitest';

import { withConvertedPdf } from './substitute';

describe('withConvertedPdf', () => {
  const d = { id: 'a', storage_path: 'c/1.hwp', doc_name: '책임멘토 멘토링 보고서_3회차.hwp', mime_type: 'application/haansofthwp' };
  it('변환본이 없으면 그대로', () => expect(withConvertedPdf(d, undefined)).toBe(d));
  it('변환본이 있으면 PDF 경로·이름·MIME 으로', () => {
    expect(withConvertedPdf(d, 'c/converted/a-1.pdf')).toEqual({ id: 'a', storage_path: 'c/converted/a-1.pdf', doc_name: '책임멘토 멘토링 보고서_3회차.pdf', mime_type: 'application/pdf' });
    expect(withConvertedPdf({ ...d, doc_name: 'x.HWPX' }, 'p.pdf').doc_name).toBe('x.pdf');
  });
});
