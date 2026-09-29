import { describe, expect, it } from 'vitest';

import { docFileHref, previewKind } from './preview-kind';

describe('previewKind', () => {
  it('확장자·MIME 로 미리보기 방식을 고른다', () => {
    expect(previewKind('홍길동-김철수-1회차-오프라인.PDF')).toBe('pdf');
    expect(previewKind('a.hwp')).toBe('hwp');
    expect(previewKind('a.hwpx')).toBe('hwpx');
    expect(previewKind('a.docx')).toBe('docx');
    expect(previewKind('a.xlsx')).toBe('sheet');
    expect(previewKind('photo', 'image/jpeg')).toBe('image');
    expect(previewKind('a.doc')).toBe('none');
  });
  it('권한 확인 라우트 주소', () => {
    expect(docFileHref('abc', 'inline')).toBe('/api/files/doc/abc?inline=1');
    expect(docFileHref('abc', 'download')).toBe('/api/files/doc/abc');
  });
});
