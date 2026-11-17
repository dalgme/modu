/**
 * 관찰의견서 "운영기관" 칸 가리기 (2026-11-17) — 서버·브라우저·테스트 공용 순수 함수.
 *
 * 원본 파일은 건드리지 않는다. 브라우저가 받은 사본으로 쪽을 그림(픽셀)으로 만든 뒤
 * "운영기관" 글자가 든 칸의 **오른쪽 칸**을 검게 칠하고, 그 쪽은 그림으로만 PDF 에 넣는다
 * (글자 층이 남지 않으므로 복사·검색으로 내용이 새지 않는다 — 진짜 가림).
 *
 *  - 글자 위치: PDF = pdf.js 글자 정보 / 한글 = rhwp 쪽 글자 배치(getPageTextLayout)
 *  - 오른쪽 칸 찾기: 한글 = 표의 행·열 정보(정확) / PDF = 그려진 표 선(픽셀)을 따라 칸 경계를 찾는다
 *  - 못 찾으면(스캔 이미지 PDF·표가 아닌 문장·다른 항목명) 가리지 않고 "블라인드 미적용"으로 알린다
 */

export const OPERATOR_LABEL = '운영기관';

/** 화면(캔버스) 좌표 글자 상자 — y = 윗변 */
export interface TextBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 글자별 x 경계(길이 = 글자 수 + 1, x 기준 상대값). 없으면 폭을 글자 수로 나눈다 */
  charX?: number[];
  /** 같은 칸 판정용(한글) — 다른 칸의 글자와 이어 붙이지 않는다 */
  cellKey?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CharBox {
  ch: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  src: number;
}

const strip = (s: string) => s.replace(/\s+/g, '');

/** 낱말 덩어리로 볼 글자 사이 간격(글자 높이 배수) — 띄어쓰기 한 칸 ≈ 0.25~0.35, 표 칸 사이(안쪽 여백 2개) ≈ 0.6 이상 */
export const CLUSTER_GAP = 0.45;
/** 항목 이름에 붙어도 되는 꾸밈 글자 */
const LABEL_EXTRA = /^[:：*※·•()（）[\]명칭]*$/;
const MAX_LABEL_EXTRA = 3;

/**
 * 글자 상자들에서 label(공백 무시 — "운 영 기 관"도 찾는다) 위치를 모두 찾는다.
 * 같은 줄(세로 중심이 겹침)·같은 칸의 상자만 이어 붙인다.
 */
export function findLabelBoxes(boxes: TextBox[], label = OPERATOR_LABEL): Rect[] {
  const target = strip(label);
  if (!target) return [];
  // 줄 묶기 — 세로 중심이 서로의 높이 절반 안이면 같은 줄
  const items = boxes.filter((b) => b.text && b.w > 0 && b.h > 0).map((b, i) => ({ b, i, cy: b.y + b.h / 2 }));
  items.sort((a, b) => a.cy - b.cy || a.b.x - b.b.x);
  const lines: (typeof items)[] = [];
  for (const it of items) {
    const line = lines.find((l) => Math.abs(l[0]!.cy - it.cy) <= Math.min(l[0]!.b.h, it.b.h) * 0.5 && (l[0]!.b.cellKey ?? '') === (it.b.cellKey ?? ''));
    if (line) line.push(it);
    else lines.push([it]);
  }
  const out: Rect[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.b.x - b.b.x);
    const chars: CharBox[] = [];
    for (const { b, i } of line) {
      const n = b.text.length;
      for (let k = 0; k < n; k++) {
        const ch = b.text[k]!;
        if (/\s/.test(ch)) continue;
        const x0 = b.charX && b.charX.length > k + 1 ? b.x + b.charX[k]! : b.x + (b.w * k) / n;
        const x1 = b.charX && b.charX.length > k + 1 ? b.x + b.charX[k + 1]! : b.x + (b.w * (k + 1)) / n;
        chars.push({ ch, x0, x1, y0: b.y, y1: b.y + b.h, src: i });
      }
    }
    const str = chars.map((c) => c.ch).join('');
    for (let at = str.indexOf(target); at >= 0; at = str.indexOf(target, at + target.length)) {
      const hit = chars.slice(at, at + target.length);
      // 글자 사이가 너무 벌어지면(다른 칸) 같은 낱말이 아니다 — 글자 높이의 3배까지 허용(균등 분할 대비)
      const h = Math.max(...hit.map((c) => c.y1 - c.y0));
      const gapOk = hit.every((c, k) => k === 0 || c.x0 - hit[k - 1]!.x1 <= h * 3);
      if (!gapOk) continue;
      // 항목 이름으로 홀로 선 경우만 — 붙어 있는 글자(낱말 덩어리)를 양옆으로 넓혀 보고, 덧붙은 글자가
      // "명·:·※·*" 같은 짧은 꾸밈뿐일 때만 인정한다("운영기관의 안내에 따라…" 같은 문장 속 낱말은 제외)
      let a = at;
      let b = at + target.length - 1;
      while (a > 0 && chars[a]!.x0 - chars[a - 1]!.x1 <= h * CLUSTER_GAP) a--;
      while (b < chars.length - 1 && chars[b + 1]!.x0 - chars[b]!.x1 <= h * CLUSTER_GAP) b++;
      const extra = chars.slice(a, at).concat(chars.slice(at + target.length, b + 1)).map((c) => c.ch).join('');
      if (extra.length > MAX_LABEL_EXTRA || !LABEL_EXTRA.test(extra)) continue;
      const cluster = chars.slice(a, b + 1);
      const x0 = Math.min(...cluster.map((c) => c.x0));
      const x1 = Math.max(...cluster.map((c) => c.x1));
      const y0 = Math.min(...cluster.map((c) => c.y0));
      const y1 = Math.max(...cluster.map((c) => c.y1));
      out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return out;
}

/* ── 한글: 표 셀 정보로 오른쪽 칸 ───────────────────────────────────────── */

export interface CellBox {
  cellIdx: number;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  pageIndex?: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 라벨 칸의 바로 오른쪽 열에 있고 라벨 칸과 행이 겹치는 칸들 */
export function rightCellsOf(cells: CellBox[], labelCellIdx: number): CellBox[] {
  const L = cells.find((c) => c.cellIdx === labelCellIdx);
  if (!L) return [];
  const col = L.col + Math.max(1, L.colSpan);
  const r0 = L.row;
  const r1 = L.row + Math.max(1, L.rowSpan);
  return cells.filter((c) => c.col <= col && col < c.col + Math.max(1, c.colSpan) && c.row < r1 && r0 < c.row + Math.max(1, c.rowSpan));
}

/* ── PDF: 그려진 표 선(픽셀)으로 오른쪽 칸 ──────────────────────────────── */

export interface ImageLike {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8ClampedArray | Uint8Array;
}

/** 선으로 볼 어두운 정도(밝기 0~255 중 이 값 미만) — 연한 칸 배경색은 선이 아니다 */
export const LINE_LUMA = 170;
/** 한 줄(행·열)의 이 비율 이상이 어두우면 표 선 */
export const LINE_COVERAGE = 0.85;

function makeDark(img: ImageLike) {
  return (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false;
    const i = (Math.round(y) * img.width + Math.round(x)) * 4;
    const a = img.data[i + 3]!;
    if (a < 128) return false;
    return 0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]! < LINE_LUMA;
  };
}

function rowIsLine(dark: (x: number, y: number) => boolean, y: number, x0: number, x1: number): boolean {
  const a = Math.ceil(x0);
  const b = Math.floor(x1);
  if (b - a < 3) return false;
  let n = 0;
  for (let x = a; x <= b; x++) if (dark(x, y)) n++;
  return n / (b - a + 1) >= LINE_COVERAGE;
}

function colIsLine(dark: (x: number, y: number) => boolean, x: number, y0: number, y1: number): boolean {
  const a = Math.ceil(y0);
  const b = Math.floor(y1);
  if (b - a < 3) return false;
  let n = 0;
  for (let y = a; y <= b; y++) if (dark(x, y)) n++;
  return n / (b - a + 1) >= LINE_COVERAGE;
}

/** from 부터 step 방향으로 test 가 참인 첫 위치(선) → [선 시작, 선 끝(굵은 선)] */
function scanLine(from: number, to: number, step: 1 | -1, test: (v: number) => boolean): [number, number] | null {
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) {
    if (!test(v)) continue;
    let end = v;
    while ((step > 0 ? end + step <= to : end + step >= to) && test(end + step)) end += step;
    return [v, end];
  }
  return null;
}

/**
 * 라벨 글자 상자 → 라벨 칸의 위·아래 선 → 오른쪽 선 2개(라벨 칸 오른쪽 = 대상 칸 왼쪽, 대상 칸 오른쪽) →
 * 대상 칸 안에서 위·아래 선을 다시 찾아 칸 안쪽 영역을 돌려준다. 표 선을 못 찾으면 null.
 */
export function detectRightCell(img: ImageLike, label: Rect): Rect | null {
  const dark = makeDark(img);
  const h = Math.max(4, label.h);
  const cy = label.y + label.h / 2;
  // 1) 라벨 칸 위·아래 선 (라벨 폭 전체를 가로지르는 선)
  const up = scanLine(Math.floor(label.y) - 1, Math.max(0, Math.floor(label.y - h * 4)), -1, (y) => rowIsLine(dark, y, label.x, label.x + label.w));
  const down = scanLine(Math.ceil(label.y + label.h) + 1, Math.min(img.height - 1, Math.ceil(label.y + label.h + h * 4)), 1, (y) => rowIsLine(dark, y, label.x, label.x + label.w));
  if (!up || !down) return null;
  const top = Math.min(up[0], up[1]);
  const bottom = Math.max(down[0], down[1]);
  const inTop = Math.max(up[0], up[1]) + 1;
  const inBottom = Math.min(down[0], down[1]) - 1;
  if (inBottom - inTop < 3) return null;
  // 2) 오른쪽으로: 라벨 칸 오른쪽 선 → 대상 칸 오른쪽 선
  const isV = (x: number) => colIsLine(dark, x, inTop + 1, inBottom - 1);
  const first = scanLine(Math.ceil(label.x + label.w) + 1, img.width - 1, 1, isV);
  if (!first) return null;
  const second = scanLine(first[1] + 1, img.width - 1, 1, isV);
  if (!second) return null;
  const left = first[1] + 1;
  const right = second[0] - 1;
  if (right - left < 3) return null;
  // 3) 대상 칸 자신의 위·아래 선(오른쪽 칸이 라벨 칸보다 높거나 낮을 수 있다)
  const rUp = scanLine(Math.floor(cy), Math.max(0, top - Math.ceil(h * 6)), -1, (y) => rowIsLine(dark, y, left + 1, right - 1));
  const rDown = scanLine(Math.ceil(cy), Math.min(img.height - 1, bottom + Math.ceil(h * 6)), 1, (y) => rowIsLine(dark, y, left + 1, right - 1));
  const y0 = rUp ? Math.max(rUp[0], rUp[1]) + 1 : inTop;
  const y1 = rDown ? Math.min(rDown[0], rDown[1]) - 1 : inBottom;
  if (y1 - y0 < 3) return null;
  return { x: left, y: y0, w: right - left + 1, h: y1 - y0 + 1 };
}

/* ── 묶음 이름 ─────────────────────────────────────────────────────────── */

export type ObservationOrder = 'mentor' | 'mentee';

export function observationZipBase(groupName: string, order: ObservationOrder): string {
  return `${cleanFile(groupName, '라운드')} 관찰의견서(${order === 'mentor' ? '멘토별' : '멘티별'})`;
}

/** "001. 강석우멘토-남준현멘티 관찰의견서.pdf" (멘티별이면 멘티가 앞) */
export type BlindStatus = 'full' | 'partial' | 'none';

export const BLIND_SUFFIX: Record<BlindStatus, string> = { full: '', partial: ' (블라인드 일부 확인 필요)', none: ' (블라인드 미적용)' };

export function observationFileName(index: number, total: number, mentorName: string, menteeName: string, order: ObservationOrder, status: BlindStatus, ext = 'pdf'): string {
  const width = Math.max(3, String(total).length);
  const mentor = `${cleanFile(mentorName, '멘토')}멘토`;
  const mentee = `${cleanFile(menteeName, '멘티')}멘티`;
  const pair = order === 'mentor' ? `${mentor}-${mentee}` : `${mentee}-${mentor}`;
  return `${String(index).padStart(width, '0')}. ${pair} 관찰의견서${BLIND_SUFFIX[status]}.${ext}`;
}

function cleanFile(s: string | null | undefined, fallback: string): string {
  const v = (s ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return v || fallback;
}

/* ── 서버 → 브라우저 목록 ──────────────────────────────────────────────── */

export interface ObservationBundleItem {
  mentorName: string;
  menteeName: string;
  sourceName: string;
  /** pdf | hwp | other */
  kind: 'pdf' | 'hwp' | 'other';
  url: string;
}

export interface ObservationBundleManifest {
  order: ObservationOrder;
  groupName: string;
  /** 바깥 ZIP·안쪽 폴더 이름(확장자 없음) */
  base: string;
  /** 번호 순서대로 */
  items: ObservationBundleItem[];
  notes: string[];
}
