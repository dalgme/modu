/**
 * 업로드 문서 글자 추출 (2026-09-30) — 서버(Node) 전용 계산 모듈. `GET /api/files/doc/{id}/text` 가 쓴다.
 * 브라우저가 직접 그리지 못하는 형식(한글 HWP 가 브라우저 렌더러에서 실패할 때, Word 97~2003 DOC)의 대체 미리보기다.
 *  - 'server-only' 를 import 하지 않는다: vitest(node)에서 단위 테스트하기 위해. node:zlib 을 쓰므로 클라이언트 번들에는 들어갈 수 없다.
 *  - 어떤 입력에도 예외를 던지지 않는다 — 실패는 note 안내 문구로 돌려준다.
 *
 * HWP 5.x (한글 2002 이후 바이너리) — 한컴 공개 문서 "한글 문서 파일 형식 5.0" 기준
 *  - CFB(OLE) 컨테이너. FileHeader(256바이트): 0~31 서명 "HWP Document File", 32~35 버전(DWORD 0xMMnnPPrr), 36~39 속성 비트
 *    (bit0 압축 · bit1 암호 · bit2 배포용 · bit4 DRM · bit8 공인인증서 암호화 · bit10 공인인증서 DRM)
 *  - 본문 = BodyText/Section0..N 스트림. 압축 문서는 raw deflate(zlib 헤더 없음)
 *  - 레코드 = 헤더 DWORD(TagID 10비트 · Level 10비트 · Size 12비트, Size 가 0xFFF 면 다음 DWORD 가 실제 크기) + 데이터
 *  - HWPTAG_PARA_TEXT(= HWPTAG_BEGIN 0x10 + 51 = 67) 가 문단 글자(UTF-16LE). 제어 문자(0~31)는 표 6 규칙으로 건너뛴다:
 *      char 형(1 WCHAR)   : 0 · 10(줄바꿈) · 13(문단 끝) · 24~31(24 하이픈, 30 묶음 빈칸, 31 고정폭 빈칸)
 *      inline 형(8 WCHAR) : 4~9 · 19~20 (9 = 탭)
 *      extended 형(8 WCHAR): 1~3 · 11~12 · 14~18 · 21~23 (구역·표·그림·머리말·각주 등 개체 — 개체 안 글자는 뒤따르는 문단 레코드로 나온다)
 */
import { inflateRawSync, inflateSync } from 'node:zlib';

import { hwpxBlocksToParagraphs, readHwpx } from '@/lib/files/hwpx';
import { sniffKind } from '@/lib/files/preview-kind';

export type ExtractKind = 'hwp' | 'doc' | 'hwpx' | 'docx' | 'unknown';

export interface ExtractResult {
  kind: ExtractKind;
  paragraphs: string[];
  /** 추출이 안 되거나 일부만 된 이유 — 화면 안내용 */
  note?: string;
}

export const HWPTAG_PARA_TEXT = 67;
/** 압축 해제 상한 — 압축 폭탄 방지 (본문 섹션 하나당) */
const MAX_INFLATE = 64 * 1024 * 1024;

/** PARA_TEXT 레코드 데이터(UTF-16LE) → 글자. 제어 문자는 위 규칙대로 폭만큼 건너뛴다 */
export function decodeParaText(data: Uint8Array): string {
  const n = Math.floor(data.length / 2);
  let out = '';
  let i = 0;
  while (i < n) {
    const c = data[i * 2]! | (data[i * 2 + 1]! << 8);
    if (c >= 32) {
      out += String.fromCharCode(c); // 서로게이트 쌍은 두 코드 단위를 그대로 이어 붙이면 복원된다
      i += 1;
      continue;
    }
    // char 형 — 1 WCHAR
    if (c === 0 || c === 10 || c === 13 || c >= 24) {
      if (c === 10) out += '\n';
      else if (c === 24) out += '-';
      else if (c === 30 || c === 31) out += ' ';
      i += 1;
      continue;
    }
    // inline(4~9, 19~20) · extended(1~3, 11~12, 14~18, 21~23) 형 — 8 WCHAR (제어 문자 + 정보 12바이트 + 제어 문자)
    if (c === 9) out += '\t';
    i += 8;
  }
  return out;
}

/** 압축 해제된 섹션 스트림 → 문단 글자 목록 (레코드 파서) */
export function parseHwpSectionRecords(buf: Uint8Array): string[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: string[] = [];
  let off = 0;
  while (off + 4 <= buf.length) {
    const h = view.getUint32(off, true);
    off += 4;
    const tag = h & 0x3ff;
    let size = (h >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (off + 4 > buf.length) break;
      size = view.getUint32(off, true);
      off += 4;
    }
    if (size > buf.length - off) break; // 잘린 레코드 — 여기까지만
    if (tag === HWPTAG_PARA_TEXT) {
      const text = decodeParaText(buf.subarray(off, off + size)).replace(/\s+$/, '');
      if (text.trim()) out.push(text);
    }
    off += size;
  }
  return out;
}

function inflateSection(content: Uint8Array, compressed: boolean): Uint8Array {
  if (!compressed) return content;
  try {
    return inflateRawSync(content, { maxOutputLength: MAX_INFLATE });
  } catch {
    // 일부 변환 도구는 zlib 헤더를 붙여 저장한다
    return inflateSync(content, { maxOutputLength: MAX_INFLATE });
  }
}

/** HWP 5.x 바이너리 → 문단 */
export async function extractHwp(buf: Buffer): Promise<ExtractResult> {
  const CFB = await import('cfb');
  let container: ReturnType<typeof CFB.read>;
  try {
    container = CFB.read(buf, { type: 'buffer' });
  } catch {
    return { kind: 'hwp', paragraphs: [], note: '한글(HWP) 파일 구조를 읽지 못했습니다. 파일이 손상됐을 수 있습니다.' };
  }
  const header = CFB.find(container, 'FileHeader');
  const h = header?.content ? Buffer.from(header.content as Uint8Array) : null;
  if (!h || h.length < 40 || !h.subarray(0, 17).toString('latin1').startsWith('HWP Document File')) {
    return { kind: 'hwp', paragraphs: [], note: '한글 HWP 5.0 이후 형식이 아닙니다(한글 97 이전 문서는 미리보기를 지원하지 않습니다).' };
  }
  const props = h.readUInt32LE(36);
  if (props & 0x2) return { kind: 'hwp', paragraphs: [], note: '암호가 걸린 한글 문서라 미리보기를 할 수 없습니다.' };
  if (props & (0x10 | 0x100 | 0x400)) return { kind: 'hwp', paragraphs: [], note: '보안(DRM·인증서 암호화)이 적용된 한글 문서라 미리보기를 할 수 없습니다.' };
  if (props & 0x4) return { kind: 'hwp', paragraphs: [], note: '배포용(읽기 전용)으로 저장된 한글 문서라 미리보기를 할 수 없습니다. 한글에서 일반 문서로 다시 저장해 올려 주세요.' };
  const compressed = (props & 0x1) === 0x1;

  const sections: { n: number; content: Uint8Array }[] = [];
  container.FullPaths.forEach((p, i) => {
    const m = /\/BodyText\/Section(\d+)$/i.exec(p);
    const entry = container.FileIndex[i];
    if (m && entry?.content) sections.push({ n: Number(m[1]), content: Uint8Array.from(entry.content as ArrayLike<number>) });
  });
  sections.sort((a, b) => a.n - b.n);
  if (sections.length === 0) return { kind: 'hwp', paragraphs: [], note: '한글 문서 본문(BodyText)을 찾지 못했습니다.' };

  const paragraphs: string[] = [];
  let failed = 0;
  for (const s of sections) {
    try {
      paragraphs.push(...parseHwpSectionRecords(inflateSection(s.content, compressed)));
    } catch {
      failed++;
    }
  }
  const note =
    failed > 0
      ? `본문 ${sections.length}구역 중 ${failed}구역을 읽지 못했습니다.`
      : paragraphs.length === 0
        ? '문서에 표시할 글자가 없습니다(그림·도형만 있는 문서일 수 있습니다).'
        : undefined;
  return { kind: 'hwp', paragraphs, ...(note ? { note } : {}) };
}

/** Word 97~2003(.doc) · Word 2007+(.docx) → 문단 (word-extractor: 피스 테이블·필드 코드 처리) */
async function extractWord(buf: Buffer, kind: 'doc' | 'docx'): Promise<ExtractResult> {
  try {
    const { default: WordExtractor } = await import('word-extractor');
    const doc = await new WordExtractor().extract(buf);
    const body = [doc.getBody(), doc.getFootnotes(), doc.getEndnotes()].filter((s): s is string => !!s && !!s.trim()).join('\n');
    const paragraphs = body
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.trim());
    return { kind, paragraphs, ...(paragraphs.length === 0 ? { note: '문서에 표시할 글자가 없습니다.' } : {}) };
  } catch {
    return { kind, paragraphs: [], note: 'Word 문서를 읽지 못했습니다. 파일이 손상됐거나 암호가 걸려 있을 수 있습니다.' };
  }
}

/** 파일 바이트 → 문단 글자 (형식은 매직 넘버 우선) — 예외를 던지지 않는다 */
export async function extractText(buf: Buffer, name: string): Promise<ExtractResult> {
  const kind = sniffKind(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), name);
  try {
    if (kind === 'hwp') return await extractHwp(buf);
    if (kind === 'doc' || kind === 'docx') return await extractWord(buf, kind);
    if (kind === 'hwpx') {
      const r = await readHwpx(buf);
      const paragraphs = hwpxBlocksToParagraphs(r.blocks);
      return { kind: 'hwpx', paragraphs, ...(paragraphs.length === 0 ? { note: '문서에 표시할 글자가 없습니다.' } : {}) };
    }
  } catch {
    return { kind: kind === 'hwpx' ? 'hwpx' : 'unknown', paragraphs: [], note: '문서를 읽지 못했습니다. 파일이 손상됐을 수 있습니다.' };
  }
  return { kind: 'unknown', paragraphs: [], note: '글자 추출을 지원하지 않는 형식입니다(지원: 한글 HWP·HWPX, Word DOC·DOCX).' };
}
