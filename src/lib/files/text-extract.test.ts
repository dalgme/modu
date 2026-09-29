import { deflateRawSync } from 'node:zlib';

import * as CFB from 'cfb';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { describe, expect, it } from 'vitest';

import { decodeParaText, extractText, HWPTAG_PARA_TEXT, parseHwpSectionRecords } from './text-extract';

/** UTF-16LE 코드 단위 배열 → 바이트 */
const u16 = (units: number[]) => {
  const b = Buffer.alloc(units.length * 2);
  units.forEach((u, i) => b.writeUInt16LE(u, i * 2));
  return b;
};
const units = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
/** 레코드 1개 (Size 가 4095 이상이면 확장 크기 DWORD) */
const record = (tag: number, data: Buffer, level = 0) => {
  const big = data.length >= 0xfff;
  const h = Buffer.alloc(big ? 8 : 4);
  h.writeUInt32LE(((tag & 0x3ff) | ((level & 0x3ff) << 10) | ((big ? 0xfff : data.length) << 20)) >>> 0, 0);
  if (big) h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data]);
};
/** 8 WCHAR 제어 문자 (제어 코드 + 정보 12바이트 + 제어 코드) */
const ctrl8 = (code: number) => [code, 0x6c74, 0x6274, 0, 0, 0, 0, code];

/** 한글 HWP 5.x 구조를 흉내 낸 CFB 파일 */
function fakeHwp(sections: Buffer[], props = 0x1): Buffer {
  const cfb = CFB.utils.cfb_new();
  const header = Buffer.alloc(256);
  header.write('HWP Document File', 0, 'latin1');
  header.writeUInt32LE(0x05010100, 32); // 5.1.1.0
  header.writeUInt32LE(props, 36);
  CFB.utils.cfb_add(cfb, 'FileHeader', header);
  CFB.utils.cfb_add(cfb, 'DocInfo', deflateRawSync(Buffer.alloc(0)));
  sections.forEach((s, i) => CFB.utils.cfb_add(cfb, `BodyText/Section${i}`, props & 0x1 ? deflateRawSync(s) : s));
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }) as Uint8Array);
}

describe('HWP PARA_TEXT 디코딩', () => {
  it('제어 문자 폭(1/8 WCHAR)을 규칙대로 건너뛴다', () => {
    const data = u16([
      ...units('가'),
      ...ctrl8(2), // 구역 정의(extended)
      ...units('나'),
      ...ctrl8(9), // 탭(inline)
      ...units('다'),
      10, // 줄바꿈(char)
      ...units('라'),
      ...ctrl8(11), // 표(extended)
      30, // 묶음 빈칸
      ...units('마'),
      0xd83d,
      0xde00, // 서로게이트 쌍(😀)
      13, // 문단 끝
    ]);
    expect(decodeParaText(data)).toBe('가나\t다\n라 마😀');
  });
  it('레코드 파서 — 일반·확장 크기 레코드, 다른 태그는 건너뜀, 잘린 레코드에서 멈춤', () => {
    const long = '가'.repeat(3000); // 6000바이트 → 확장 크기
    const buf = Buffer.concat([
      record(66, Buffer.alloc(22)), // PARA_HEADER
      record(HWPTAG_PARA_TEXT, u16([...units('첫 문단'), 13])),
      record(68, Buffer.alloc(8)), // PARA_CHAR_SHAPE
      record(HWPTAG_PARA_TEXT, u16([...units(long), 13]), 1),
      record(HWPTAG_PARA_TEXT, u16([13])), // 빈 문단
      Buffer.from([0x43, 0x00, 0xf0, 0x7f]), // 크기만 크고 데이터가 없는 잘린 레코드
    ]);
    expect(parseHwpSectionRecords(buf)).toEqual(['첫 문단', long]);
  });
});

describe('extractText', () => {
  it('HWP(압축) 전체 경로 — CFB → 섹션 순서 → raw inflate → 문단', async () => {
    const s0 = record(HWPTAG_PARA_TEXT, u16([...units('1구역'), 13]));
    const s1 = record(HWPTAG_PARA_TEXT, u16([...units('2구역'), 13]));
    const r = await extractText(fakeHwp([s0, s1]), '보고서.hwp');
    expect(r).toEqual({ kind: 'hwp', paragraphs: ['1구역', '2구역'] });
  });
  it('HWP(비압축)도 읽는다', async () => {
    const r = await extractText(fakeHwp([record(HWPTAG_PARA_TEXT, u16(units('비압축')))], 0), 'a.hwp');
    expect(r.paragraphs).toEqual(['비압축']);
  });
  it('암호·배포용 문서는 안내 문구', async () => {
    const enc = await extractText(fakeHwp([], 0x1 | 0x2), 'a.hwp');
    expect(enc.paragraphs).toEqual([]);
    expect(enc.note).toContain('암호');
    const dist = await extractText(fakeHwp([], 0x1 | 0x4), 'a.hwp');
    expect(dist.note).toContain('배포용');
  });
  it('DOCX 는 word-extractor 로 글자를 읽는다', async () => {
    const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('사업 개요')] }), new Paragraph('두 번째 문단')] }] });
    const r = await extractText(Buffer.from(await Packer.toBuffer(doc)), 'plan.docx');
    expect(r.kind).toBe('docx');
    expect(r.paragraphs).toEqual(['사업 개요', '두 번째 문단']);
  });
  it('망가진 입력에도 예외 없이 안내만', async () => {
    const garbage = Buffer.from('this is not a document at all');
    await expect(extractText(garbage, 'x.hwp')).resolves.toMatchObject({ kind: 'unknown', paragraphs: [] });
    const brokenCfb = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.from(Array.from({ length: 600 }, (_, i) => i % 7)), Buffer.from('F\0i\0l\0e\0H\0e\0a\0d\0e\0r\0')]);
    const r = await extractText(brokenCfb, 'x.hwp');
    expect(r.paragraphs).toEqual([]);
    expect(r.note).toBeTruthy();
    const brokenDoc = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.from('W\0o\0r\0d\0D\0o\0c\0u\0m\0e\0n\0t\0'), Buffer.alloc(600)]);
    const d = await extractText(brokenDoc, 'x.doc');
    expect(d).toMatchObject({ kind: 'doc', paragraphs: [] });
    expect(d.note).toBeTruthy();
  });
});
