import { describe, expect, it } from 'vitest';

import { docFileHref, previewKind, sniffKind, safeViewerMetaUrl, viewerPageHref } from './preview-kind';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const utf16 = (s: string) => Array.from(s).flatMap((c) => [c.charCodeAt(0), 0]);
const CFB_SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

describe('previewKind', () => {
  it('확장자·MIME 로 미리보기 방식을 고른다', () => {
    expect(previewKind('홍길동-김철수-1회차-오프라인.PDF')).toBe('pdf');
    expect(previewKind('a.hwp')).toBe('hwp');
    expect(previewKind('a.hwpx')).toBe('hwpx');
    expect(previewKind('a.docx')).toBe('docx');
    expect(previewKind('a.doc')).toBe('doc');
    expect(previewKind('a.xlsx')).toBe('sheet');
    expect(previewKind('photo', 'image/jpeg')).toBe('image');
    expect(previewKind('a.zip')).toBe('none');
  });
  it('권한 확인 라우트 주소', () => {
    expect(docFileHref('abc', 'inline')).toBe('/api/files/doc/abc?inline=1');
    expect(docFileHref('abc', 'download')).toBe('/api/files/doc/abc');
    expect(docFileHref('abc', 'meta')).toBe('/api/files/doc/abc?meta=1');
    expect(docFileHref('abc', 'text')).toBe('/api/files/doc/abc/text');
  });
});

describe('sniffKind — 바이트 우선, 확장자 보조', () => {
  it('PDF·이미지 매직 넘버', () => {
    expect(sniffKind(bytes('%PDF-1.7\n'), '보고서.hwp')).toBe('pdf'); // 확장자가 틀려도 내용 기준
    expect(sniffKind(bytes([0x0d, 0x0a], '%PDF-1.4'), 'a.pdf')).toBe('pdf'); // 앞 쓰레기 바이트 허용
    expect(sniffKind(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), 'photo')).toBe('image');
    expect(sniffKind(bytes([0xff, 0xd8, 0xff, 0xe0]), 'a.bin')).toBe('image');
  });
  it('ZIP 계열 — DOCX · HWPX · XLSX', () => {
    expect(sniffKind(bytes([0x50, 0x4b, 0x03, 0x04], 'xxxx[Content_Types].xml....word/document.xml'), 'a.doc')).toBe('docx');
    expect(sniffKind(bytes([0x50, 0x4b, 0x03, 0x04], '....mimetypeapplication/hwp+zip'), 'a.zip')).toBe('hwpx');
    expect(sniffKind(bytes([0x50, 0x4b, 0x03, 0x04], '....Contents/section0.xml'), 'a.hwpx')).toBe('hwpx');
    expect(sniffKind(bytes([0x50, 0x4b, 0x03, 0x04], '....xl/workbook.xml'), 'a.xlsx')).toBe('sheet');
  });
  it('CFB(OLE) 계열 — HWP · DOC · XLS', () => {
    expect(sniffKind(bytes(CFB_SIG, [0, 0], utf16('FileHeader'), utf16('BodyText')), 'a.doc')).toBe('hwp');
    expect(sniffKind(bytes(CFB_SIG, [0, 0], utf16('WordDocument')), 'a.hwp')).toBe('doc');
    expect(sniffKind(bytes(CFB_SIG, [0, 0], utf16('Workbook')), 'a.xls')).toBe('sheet');
  });
  it('내용이 확장자와 맞지 않으면 미지원, 텍스트는 확장자대로', () => {
    expect(sniffKind(bytes('hello'), 'a.pdf')).toBe('none');
    expect(sniffKind(bytes('hello'), 'a.hwp')).toBe('none');
    expect(sniffKind(bytes('a,b\n1,2'), 'a.csv')).toBe('sheet');
    expect(sniffKind(bytes('memo'), 'a.txt')).toBe('text');
    expect(sniffKind(new Uint8Array(0), '')).toBe('none');
  });
});

describe('viewer page (새 창 자체 뷰어)', () => {
  it('문서 id 는 /files/view?doc= 로', () => {
    expect(viewerPageHref({ docId: 'abc' })).toBe('/files/view?doc=abc');
  });
  it('meta 주소는 같은 출처 /api/files/ 만 허용', () => {
    expect(safeViewerMetaUrl('/api/files/mentor-payment/merged/x?meta=1')).toBe('/api/files/mentor-payment/merged/x?meta=1');
    expect(safeViewerMetaUrl('https://evil.example/api/files/x')).toBeNull();
    expect(safeViewerMetaUrl('//evil.example/api/files/x')).toBeNull();
    expect(safeViewerMetaUrl('/api/files/../auth/x')).toBeNull();
    expect(safeViewerMetaUrl('/api/other')).toBeNull();
    expect(viewerPageHref({ metaUrl: 'https://evil.example' })).toBeNull();
  });
});
