/**
 * 한글 HWPX(OWPML, zip + XML) 문서 → 문단·표 블록 (2026-09-30) — 서버·클라이언트 중립 파일.
 * 미리보기 창(브라우저)과 글자 추출 라우트(서버)가 같이 쓴다. DOMParser 가 없는 서버에서도 돌도록 작은 태그 스캐너로 읽는다.
 *
 * 구조(요약): Contents/section{N}.xml → hs:sec > hp:p(문단) > hp:run > hp:t(글자) | hp:tbl(표) | hp:pic(그림) …
 *   표: hp:tbl > hp:tr > hp:tc(셀, hp:cellSpan colSpan/rowSpan) > hp:subList > hp:p …
 *   글자 안의 hp:tab / hp:lineBreak 는 탭·줄바꿈으로, 머리말·꼬리말(hp:header/footer)은 건너뛴다.
 * 그림·수식·OLE 개체는 그리지 않고 "[그림]" 자리 표시만 남긴다.
 */
export interface HwpxCell {
  text: string;
  colSpan: number;
  rowSpan: number;
}

export type HwpxBlock = { t: 'p'; text: string } | { t: 'table'; rows: HwpxCell[][] };

export interface HwpxResult {
  blocks: HwpxBlock[];
  /** 건너뛴 그림·개체 수 */
  images: number;
}

const ENTITY: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return ENTITY[e.toLowerCase()] ?? m;
  });
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(attrs) ?? new RegExp(`(?:^|\\s)${name}\\s*=\\s*'([^']*)'`).exec(attrs);
  return m ? m[1]! : null;
}

const OBJECT_TAGS = new Set(['pic', 'ole', 'equation', 'video', 'chart']);
const SKIP_TAGS = new Set(['header', 'footer']);

type Container = { kind: 'root' } | { kind: 'cell'; cell: HwpxCell; lines: string[] };

/** section XML 한 개 → 블록 목록 */
export function parseHwpxSection(xml: string): HwpxResult {
  const blocks: HwpxBlock[] = [];
  let images = 0;
  const containers: Container[] = [{ kind: 'root' }];
  const paras: string[] = []; // 열린 문단(중첩 — 표 셀 안 문단)의 글자 버퍼
  const tables: HwpxCell[][][] = [];
  let inText = 0; // hp:t 깊이
  let skip = 0; // 머리말·꼬리말 깊이

  const container = () => containers[containers.length - 1]!;
  const emitText = (text: string) => {
    const c = container();
    if (c.kind === 'cell') {
      if (text.trim()) c.lines.push(text);
    } else if (text.trim()) {
      blocks.push({ t: 'p', text });
    }
  };
  const appendToPara = (s: string) => {
    if (paras.length === 0) paras.push('');
    paras[paras.length - 1] += s;
  };

  const re = /<(\/?)([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)([^>]*?)(\/?)>|<!\[CDATA\[([\s\S]*?)\]\]>|<[!?][^>]*>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, closing, , local, attrs = '', selfClose, cdata, text] = m;
    if (text !== undefined || cdata !== undefined) {
      if (inText > 0 && skip === 0) appendToPara(cdata ?? decodeXmlEntities(text!));
      continue;
    }
    if (!local) continue; // 주석·선언
    const name = local;
    const open = !closing;
    const empty = !!selfClose;

    if (SKIP_TAGS.has(name)) {
      if (open && !empty) skip++;
      else if (!open) skip = Math.max(0, skip - 1);
      continue;
    }
    if (skip > 0) continue;

    switch (name) {
      case 'p':
        if (open && !empty) paras.push('');
        else if (!open) emitText(paras.pop() ?? '');
        break;
      case 't':
        if (open && !empty) inText++;
        else if (!open) inText = Math.max(0, inText - 1);
        break;
      case 'tab':
        if (open) appendToPara('\t');
        break;
      case 'lineBreak':
        if (open) appendToPara('\n');
        break;
      case 'nbSpace':
      case 'fwSpace':
        if (open) appendToPara(' ');
        break;
      case 'tbl':
        if (open && !empty) {
          // 표 앞에 같은 문단에 있던 글자는 표보다 먼저 내보낸다
          if (paras.length > 0) {
            emitText(paras[paras.length - 1]!);
            paras[paras.length - 1] = '';
          }
          tables.push([]);
        } else if (!open) {
          const rows = tables.pop() ?? [];
          const c = container();
          if (c.kind === 'cell') {
            // 표 안의 표 — 셀 글자로 펼친다
            for (const r of rows) {
              const line = r.map((x) => x.text).filter(Boolean).join(' | ');
              if (line) c.lines.push(line);
            }
          } else if (rows.length > 0) {
            blocks.push({ t: 'table', rows });
          }
        }
        break;
      case 'tr':
        if (open && !empty && tables.length > 0) tables[tables.length - 1]!.push([]);
        break;
      case 'tc':
        if (open && !empty && tables.length > 0) {
          const rows = tables[tables.length - 1]!;
          if (rows.length === 0) rows.push([]);
          const cell: HwpxCell = { text: '', colSpan: 1, rowSpan: 1 };
          rows[rows.length - 1]!.push(cell);
          containers.push({ kind: 'cell', cell, lines: [] });
        } else if (!open) {
          const c = container();
          if (c.kind === 'cell') {
            c.cell.text = c.lines.join('\n');
            containers.pop();
          }
        }
        break;
      case 'cellSpan': {
        const c = container();
        if (open && c.kind === 'cell') {
          c.cell.colSpan = Math.max(1, Math.min(100, Number(attr(attrs, 'colSpan')) || 1));
          c.cell.rowSpan = Math.max(1, Math.min(1000, Number(attr(attrs, 'rowSpan')) || 1));
        }
        break;
      }
      default:
        if (open && OBJECT_TAGS.has(name)) {
          images++;
          appendToPara('[그림]');
          // 그림 안의 캡션·글상자 글자는 그대로 읽힌다(hp:p 가 따로 열린다)
        }
    }
  }
  // 닫히지 않은 문단(손상 파일) 정리
  while (paras.length > 0) emitText(paras.shift() ?? '');
  return { blocks, images };
}

/** HWPX zip 바이트 → 전체 섹션 블록 */
export async function readHwpx(data: ArrayBuffer | Uint8Array): Promise<HwpxResult> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(data);
  const sections = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/i)?.[1] ?? 0) - Number(b.match(/(\d+)\.xml$/i)?.[1] ?? 0));
  if (sections.length === 0) throw new Error('HWPX 본문(Contents/section*.xml)을 찾지 못했습니다.');
  const out: HwpxResult = { blocks: [], images: 0 };
  for (const name of sections) {
    const r = parseHwpxSection(await zip.file(name)!.async('string'));
    out.blocks.push(...r.blocks);
    out.images += r.images;
  }
  return out;
}

/** 블록 → 글자 문단 (표는 행마다 "셀 | 셀") — 서버 글자 추출용 */
export function hwpxBlocksToParagraphs(blocks: HwpxBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.t === 'p') out.push(b.text);
    else for (const r of b.rows) out.push(r.map((c) => c.text.replace(/\n/g, ' ')).join(' | '));
  }
  return out;
}
