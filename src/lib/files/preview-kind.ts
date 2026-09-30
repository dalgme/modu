/**
 * 업로드 파일 웹 미리보기 방식 판정 (2026-09-30) — 서버·클라이언트 중립 파일.
 * 모든 업로드 파일은 `/api/files/doc/{id}` 한 경로로 미리보기·다운로드한다 — 권한 확인은 그 라우트가 한다.
 *
 * (2026-09-30 보완) 판정은 **파일 앞머리 바이트(매직 넘버) 우선, 확장자·MIME 은 보조**다.
 *  - 업로드 시 브라우저가 MIME 을 비워 보내거나(HWP) 확장자를 바꿔 저장한 파일(.doc 인데 실제는 DOCX 등)이 흔해서,
 *    확장자만 보면 엉뚱한 렌더러로 열다가 실패한다.
 */
export type PreviewKind = 'pdf' | 'image' | 'docx' | 'hwp' | 'hwpx' | 'doc' | 'sheet' | 'text' | 'none';

/**
 * 미리보기 계약 — `GET /api/files/doc/{id}?meta=1` 및 같은 계약을 따르는 다른 파일 라우트(멘토 지급서류 등)의 응답.
 *  - url         : 짧은(≤120초) 인라인 서명 URL — 미리보기 창이 이 주소에서 파일 바이트를 직접 읽는다(download 파라미터 없음)
 *  - downloadUrl : 다운로드 주소. null = 이 사용자에게는 다운로드·인쇄가 막힌 파일(미리보기만)
 *  - textUrl     : 서버 글자 추출 주소(HWP·DOC 등 브라우저가 못 그리는 형식의 대체 미리보기). null = 제공 안 함
 */
export interface PreviewMeta {
  name: string;
  mime: string | null;
  url: string;
  downloadUrl: string | null;
  textUrl: string | null;
}

/** 서버 글자 추출 응답 — `GET /api/files/doc/{id}/text` */
export interface PreviewText {
  paragraphs: string[];
  note?: string;
}

export function fileExt(name: string | null | undefined): string {
  const n = (name ?? '').trim().toLowerCase();
  const dot = n.lastIndexOf('.');
  return dot > 0 ? n.slice(dot + 1) : '';
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

/** 확장자·MIME 만으로 고른 미리보기 방식 — 바이트를 받기 전 버튼·안내용. 실제 렌더는 `sniffKind` 결과를 따른다 */
export function previewKind(name: string | null | undefined, mime?: string | null): PreviewKind {
  const ext = fileExt(name);
  const m = (mime ?? '').toLowerCase();
  if (ext === 'pdf' || m === 'application/pdf') return 'pdf';
  if (IMAGE_EXTS.includes(ext) || (m.startsWith('image/') && m !== 'image/svg+xml')) return 'image';
  if (ext === 'docx') return 'docx';
  if (ext === 'hwp') return 'hwp';
  if (ext === 'hwpx') return 'hwpx';
  if (ext === 'doc') return 'doc';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet';
  if (['txt', 'md'].includes(ext) || m.startsWith('text/plain')) return 'text';
  return 'none';
}

function startsWith(buf: Uint8Array, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[offset + i] !== sig[i]) return false;
  return true;
}

/** 바이트 배열 안에서 부분 배열 찾기 (from~to 구간) — 대용량에서도 첫 바이트 비교로 빠르게 넘긴다 */
function indexOfBytes(buf: Uint8Array, needle: Uint8Array, from = 0, to = buf.length): number {
  const first = needle[0];
  const end = Math.min(to, buf.length) - needle.length;
  outer: for (let i = Math.max(0, from); i <= end; i++) {
    if (buf[i] !== first) continue;
    for (let j = 1; j < needle.length; j++) if (buf[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function ascii(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

/** CFB(OLE) 디렉터리 항목 이름은 UTF-16LE 로 저장된다 */
function utf16le(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) out[i * 2] = s.charCodeAt(i) & 0xff;
  return out;
}

/** ZIP 안에 이 이름의 항목이 있는가 — 로컬 헤더(앞쪽)·중앙 디렉터리(끝쪽)의 파일명은 평문이라 바이트 검색으로 충분하다 */
function zipHasEntry(buf: Uint8Array, entryPrefix: string): boolean {
  const needle = ascii(entryPrefix);
  const HEAD = 256 * 1024;
  const TAIL = 512 * 1024;
  if (indexOfBytes(buf, needle, 0, Math.min(buf.length, HEAD)) >= 0) return true;
  return indexOfBytes(buf, needle, Math.max(0, buf.length - TAIL)) >= 0;
}

/**
 * 파일 바이트로 실제 형식을 판정한다 (매직 넘버 우선, 확장자 보조).
 *  - %PDF → pdf / PNG·JPEG·GIF·WEBP·BMP → image
 *  - ZIP(PK..) : word/document.xml → docx, Contents/section*.xml 또는 mimetype=application/hwp+zip → hwpx, xl/workbook → sheet
 *  - CFB(OLE, D0 CF 11 E0) : FileHeader 스트림 → hwp(HWP 5.x), WordDocument → doc(Word 97~2003), Workbook/Book → sheet(xls)
 *  - 그 밖에는 확장자·MIME 판정(`previewKind`)으로
 */
export function sniffKind(bytes: Uint8Array, name?: string | null, mime?: string | null): PreviewKind {
  const byName = previewKind(name, mime);
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  // 일부 PDF 는 앞에 쓰레기 바이트가 붙는다(1KB 이내 %PDF- 허용 — pdf.js 도 같은 규칙)
  if (byName === 'pdf' && indexOfBytes(bytes, ascii('%PDF-'), 0, 1024) >= 0) return 'pdf';
  if (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) || // PNG
    startsWith(bytes, [0xff, 0xd8, 0xff]) || // JPEG
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) || // GIF8
    (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) || // RIFF....WEBP
    (startsWith(bytes, [0x42, 0x4d]) && byName === 'image') // BM (2바이트라 확장자도 이미지일 때만)
  ) {
    return 'image';
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (zipHasEntry(bytes, 'word/document.xml')) return 'docx';
    if (zipHasEntry(bytes, 'application/hwp+zip') || zipHasEntry(bytes, 'Contents/section')) return 'hwpx';
    if (zipHasEntry(bytes, 'xl/workbook')) return 'sheet';
    return byName === 'docx' || byName === 'hwpx' || byName === 'sheet' ? byName : 'none';
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    // HWP 5.x 는 FileHeader 스트림이 있다(본문 BodyText, 배포용 문서는 ViewText — 글자 추출이 안내 문구를 준다)
    if (indexOfBytes(bytes, utf16le('FileHeader')) >= 0) return 'hwp';
    if (indexOfBytes(bytes, utf16le('WordDocument')) >= 0) return 'doc';
    if (indexOfBytes(bytes, utf16le('Workbook')) >= 0 || indexOfBytes(bytes, utf16le('Book')) >= 0) return 'sheet';
    return byName === 'hwp' || byName === 'doc' || byName === 'sheet' ? byName : 'none';
  }
  // 바이너리 판정에 걸리지 않은 PDF·이미지·오피스 확장자는 내용이 다르다 → 미지원으로
  if (byName === 'pdf' || byName === 'image' || byName === 'docx' || byName === 'hwp' || byName === 'hwpx' || byName === 'doc') return 'none';
  return byName;
}

/** 미리보기(inline) / 다운로드 / 미리보기 계약(meta) / 글자 추출(text) 주소 — 권한 확인 라우트 */
export function docFileHref(docId: string, mode: 'inline' | 'download' | 'meta' | 'text'): string {
  const base = `/api/files/doc/${encodeURIComponent(docId)}`;
  if (mode === 'inline') return `${base}?inline=1`;
  if (mode === 'meta') return `${base}?meta=1`;
  if (mode === 'text') return `${base}/text`;
  return base;
}

/**
 * 자체 웹뷰어 "새 창" 주소 (2026-09-30) — 원본 파일(서명 URL)을 새 탭에 여는 대신 플랫폼 뷰어 페이지를 연다.
 * 브라우저 기본 PDF 뷰어의 저장·인쇄 버튼이 없어서, 미리보기 전용 파일도 새 창으로 크게 볼 수 있다.
 */
export function viewerPageHref(src: { docId?: string; metaUrl?: string }): string | null {
  if (src.docId) return `/files/view?doc=${encodeURIComponent(src.docId)}`;
  if (src.metaUrl && safeViewerMetaUrl(src.metaUrl)) return `/files/view?meta=${encodeURIComponent(src.metaUrl)}`;
  return null;
}

/** 뷰어 페이지가 받아 줄 meta 주소 — 같은 출처의 파일 라우트(/api/files/…)만. 외부 주소·경로 조작은 거부 */
export function safeViewerMetaUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('/api/files/') || url.includes('..') || url.includes('//') || url.includes('\\')) return null;
  return url;
}

/** 형식별 안내 — 미리보기 창 하단 */
export const PREVIEW_NOTES: Partial<Record<PreviewKind, string>> = {
  hwp: '한글(HWP) 문서를 브라우저에서 그린 미리보기입니다. 복잡한 표·그림은 원본과 다르게 보일 수 있습니다.',
  hwpx: '한글(HWPX) 문서의 글자와 표를 보여 줍니다(그림·글자 모양 제외).',
  doc: 'Word 97~2003(DOC) 문서는 글자만 보여 줍니다(표 모양·그림 제외).',
  docx: 'Word 문서를 브라우저에서 그린 미리보기입니다. 일부 서식은 원본과 다를 수 있습니다.',
  sheet: '엑셀 파일의 첫 번째 시트를 표로 보여 줍니다.',
};
