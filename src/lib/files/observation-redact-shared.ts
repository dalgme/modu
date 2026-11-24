/**
 * 관찰의견서 "운영기관"·"책임멘토명" 칸 가리기 (2026-11-17, 11-18 책임멘토명·도장 추가) — 서버·브라우저·테스트 공용 순수 함수.
 *
 * 원본 파일은 건드리지 않는다. 브라우저가 받은 사본으로 쪽을 그림(픽셀)으로 만든 뒤
 * 항목 이름(REDACT_LABELS)이 든 칸의 **오른쪽 칸**을 검게 칠하고(칸에 걸친 도장 같은 색 잉크까지), 그 쪽은 그림으로만 PDF 에 넣는다
 * (글자 층이 남지 않으므로 복사·검색으로 내용이 새지 않는다 — 진짜 가림).
 *
 *  - 글자 위치: PDF = pdf.js 글자 정보 / 한글 = rhwp 쪽 글자 배치(getPageTextLayout)
 *  - 오른쪽 칸 찾기: 한글 = 표의 행·열 정보(정확) / PDF = 그려진 표 선(픽셀)을 따라 칸 경계를 찾는다
 *  - 못 찾으면(스캔 이미지 PDF·표가 아닌 문장·다른 항목명) 가리지 않고 "블라인드 미적용"으로 알린다
 */

export const OPERATOR_LABEL = '운영기관';
export const MENTOR_LABEL = '책임멘토명';
/** 오른쪽 칸을 가릴 항목 이름 — 모두 찾아 가려야 '가림 완료' */
export const REDACT_LABELS: readonly string[] = [OPERATOR_LABEL, MENTOR_LABEL];

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
 * 같은 줄(세로 중심이 겹침)·같은 칸의 상자만 이어 붙인다. 좁은 칸에서 두세 줄로 꺾인 항목 이름
 * ("책임멘토" / "명")은 위아래로 붙은 낱말 덩어리를 이어 찾는다.
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
  /** 줄마다 낱말 덩어리(글자 사이 간격 ≤ CLUSTER_GAP) — 여러 줄 항목 이름 찾기용 */
  const clusters: { text: string; x0: number; x1: number; y0: number; y1: number; cellKey: string }[] = [];
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
    for (let k = 0; k < chars.length; ) {
      let e = k;
      const hh = chars[k]!.y1 - chars[k]!.y0;
      while (e < chars.length - 1 && chars[e + 1]!.x0 - chars[e]!.x1 <= hh * CLUSTER_GAP) e++;
      const part = chars.slice(k, e + 1);
      clusters.push({
        text: part.map((c) => c.ch).join(''),
        x0: Math.min(...part.map((c) => c.x0)),
        x1: Math.max(...part.map((c) => c.x1)),
        y0: Math.min(...part.map((c) => c.y0)),
        y1: Math.max(...part.map((c) => c.y1)),
        cellKey: line[0]!.b.cellKey ?? '',
      });
      k = e + 1;
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
  // 두세 줄로 꺾인 항목 이름 — 바로 아래(줄 간격 ≤ 글자 높이 0.8)에서 가로로 겹치는 덩어리를 이어 본다
  clusters.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const overlaps = (r: Rect) => out.some((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
  for (const first of clusters) {
    if (first.text.includes(target)) continue; // 한 줄에서 이미 찾음
    const stack = [first];
    for (let depth = 1; depth < 3; depth++) {
      const prev = stack[stack.length - 1]!;
      const h = prev.y1 - prev.y0;
      const next = clusters.find(
        (c) =>
          c !== prev &&
          c.cellKey === first.cellKey &&
          c.y0 >= prev.y1 - h * 0.3 &&
          c.y0 - prev.y1 <= h * 0.8 &&
          Math.min(c.x1, prev.x1) - Math.max(c.x0, prev.x0) >= Math.min(c.x1 - c.x0, prev.x1 - prev.x0) * 0.3,
      );
      if (!next) break;
      stack.push(next);
      const joined = stack.map((c) => c.text).join('');
      const at = joined.indexOf(target);
      if (at < 0) continue;
      const extra = joined.slice(0, at) + joined.slice(at + target.length);
      if (extra.length > MAX_LABEL_EXTRA || !LABEL_EXTRA.test(extra)) break;
      const x0 = Math.min(...stack.map((c) => c.x0));
      const y0 = Math.min(...stack.map((c) => c.y0));
      const rect = { x: x0, y: y0, w: Math.max(...stack.map((c) => c.x1)) - x0, h: Math.max(...stack.map((c) => c.y1)) - y0 };
      if (!overlaps(rect)) out.push(rect);
      break;
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

/**
 * 표 선 찾기 기준 — 기본은 PDF 를 그린 깨끗한 그림용.
 * 스캔(글자 인식으로 찾은 쪽)은 선이 흐리고 조금 기울어 있어 SCAN_DETECT(밝기 기준 완화·위아래 2px 허용·덮는 비율 70%)를 쓴다.
 */
export interface DetectOpts {
  luma: number;
  coverage: number;
  /** 선이 기울어 있어도 같은 선으로 볼 위아래(좌우) 허용 픽셀 */
  band: number;
}
export const DEFAULT_DETECT: DetectOpts = { luma: LINE_LUMA, coverage: LINE_COVERAGE, band: 0 };
export const SCAN_DETECT: DetectOpts = { luma: 200, coverage: 0.7, band: 2 };

function makeDark(img: ImageLike, luma = LINE_LUMA) {
  return (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return false;
    const i = (Math.round(y) * img.width + Math.round(x)) * 4;
    const a = img.data[i + 3]!;
    if (a < 128) return false;
    return 0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]! < luma;
  };
}

function rowIsLine(dark: (x: number, y: number) => boolean, y: number, x0: number, x1: number, o: DetectOpts = DEFAULT_DETECT): boolean {
  const a = Math.ceil(x0);
  const b = Math.floor(x1);
  if (b - a < 3) return false;
  let n = 0;
  for (let x = a; x <= b; x++) {
    for (let d = -o.band; d <= o.band; d++)
      if (dark(x, y + d)) {
        n++;
        break;
      }
  }
  return n / (b - a + 1) >= o.coverage;
}

function colIsLine(dark: (x: number, y: number) => boolean, x: number, y0: number, y1: number, o: DetectOpts = DEFAULT_DETECT): boolean {
  const a = Math.ceil(y0);
  const b = Math.floor(y1);
  if (b - a < 3) return false;
  let n = 0;
  for (let y = a; y <= b; y++) {
    for (let d = -o.band; d <= o.band; d++)
      if (dark(x + d, y)) {
        n++;
        break;
      }
  }
  return n / (b - a + 1) >= o.coverage;
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
export function detectRightCell(img: ImageLike, label: Rect, o: DetectOpts = DEFAULT_DETECT): Rect | null {
  const dark = makeDark(img, o.luma);
  const row = (y: number, x0: number, x1: number) => rowIsLine(dark, y, x0, x1, o);
  const col = (x: number, y0: number, y1: number) => colIsLine(dark, x, y0, y1, o);
  const g = o.band; // 허용 폭만큼 글자에서 떨어져서 찾기 시작한다(글자 윗변·아랫변을 선으로 잡지 않게)
  const h = Math.max(4, label.h);
  const cy = label.y + label.h / 2;
  // 1) 라벨 칸 위·아래 선 (라벨 폭 전체를 가로지르는 선)
  const up = scanLine(Math.floor(label.y) - 1 - g, Math.max(0, Math.floor(label.y - h * 4)), -1, (y) => row(y, label.x, label.x + label.w));
  const down = scanLine(Math.ceil(label.y + label.h) + 1 + g, Math.min(img.height - 1, Math.ceil(label.y + label.h + h * 4)), 1, (y) => row(y, label.x, label.x + label.w));
  if (!up || !down) return null;
  const top = Math.min(up[0], up[1]);
  const bottom = Math.max(down[0], down[1]);
  const inTop = Math.max(up[0], up[1]) + 1;
  const inBottom = Math.min(down[0], down[1]) - 1;
  if (inBottom - inTop < 3) return null;
  // 2) 오른쪽으로: 라벨 칸 오른쪽 선 → 대상 칸 오른쪽 선
  const isV = (x: number) => col(x, inTop + 1 + g, inBottom - 1 - g);
  const first = scanLine(Math.ceil(label.x + label.w) + 1 + g, img.width - 1, 1, isV);
  if (!first) return null;
  const second = scanLine(first[1] + 1, img.width - 1, 1, isV);
  if (!second) return null;
  const left = first[1] + 1;
  const right = second[0] - 1;
  if (right - left < 3) return null;
  // 3) 대상 칸 자신의 위·아래 선(오른쪽 칸이 라벨 칸보다 높거나 낮을 수 있다)
  const rUp = scanLine(Math.floor(cy), Math.max(0, top - Math.ceil(h * 6)), -1, (y) => row(y, left + 1 + g, right - 1 - g));
  const rDown = scanLine(Math.ceil(cy), Math.min(img.height - 1, bottom + Math.ceil(h * 6)), 1, (y) => row(y, left + 1 + g, right - 1 - g));
  const y0 = rUp ? Math.max(rUp[0], rUp[1]) + 1 : inTop;
  const y1 = rDown ? Math.min(rDown[0], rDown[1]) - 1 : inBottom;
  if (y1 - y0 < 3) return null;
  // 허용 폭으로 선이 두꺼워진 만큼 칸 안쪽이 줄어든다 — 가릴 때는 다시 그만큼 넓힌다
  return { x: left - g, y: y0 - g, w: right - left + 1 + g * 2, h: y1 - y0 + 1 + g * 2 };
}

/* ── 글자 인식(OCR) 결과 다듬기 ──────────────────────────────────────────── */

/**
 * 글자 인식은 한 글자쯤 틀리게 읽기도 하고("문영기관", "책임멘도명") 띄어 쓴 글자를 낱말 하나씩으로 준다.
 * 같은 줄의 글자를 이어 보며 항목 이름과 **한 글자만 다른**(바꿔 읽은) 자리를 항목 이름으로 고쳐 읽는다.
 * 두 줄로 꺾인 항목 이름의 앞부분(3글자 이상, 줄·낱말 끝)도 같은 규칙. 글자마다 상자 하나로 돌려준다.
 * 스캔 쪽에서 정확히 일치하는 항목을 못 찾았을 때만 쓴다(정상 글자를 바꾸지 않게).
 */
export function fuzzyLabelBoxes(boxes: TextBox[], label: string): TextBox[] {
  const L = strip(label);
  const chars: TextBox[] = [];
  for (const b of boxes) {
    const n = b.text.length;
    if (!n || b.w <= 0 || b.h <= 0) continue;
    for (let k = 0; k < n; k++) {
      const ch = b.text[k]!;
      if (/\s/.test(ch)) continue;
      const x0 = b.charX && b.charX.length > k + 1 ? b.x + b.charX[k]! : b.x + (b.w * k) / n;
      const x1 = b.charX && b.charX.length > k + 1 ? b.x + b.charX[k + 1]! : b.x + (b.w * (k + 1)) / n;
      chars.push({ text: ch, x: x0, y: b.y, w: Math.max(0.5, x1 - x0), h: b.h, cellKey: b.cellKey });
    }
  }
  const sorted = chars.slice().sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const lines: TextBox[][] = [];
  for (const c of sorted) {
    const cy = c.y + c.h / 2;
    const line = lines.find((l) => Math.abs(l[0]!.y + l[0]!.h / 2 - cy) <= Math.min(l[0]!.h, c.h) * 0.5 && (l[0]!.cellKey ?? '') === (c.cellKey ?? ''));
    if (line) line.push(c);
    else lines.push([c]);
  }
  const differsByOne = (got: string, want: string) => {
    if (got.length !== want.length || got === want) return false;
    let d = 0;
    for (let k = 0; k < got.length; k++) if (got[k] !== want[k]) d++;
    return d === 1;
  };
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    const h = Math.max(...line.map((c) => c.h));
    const gapOk = (a: number, len: number) => line.slice(a + 1, a + len).every((c, k) => c.x - (line[a + k]!.x + line[a + k]!.w) <= h * 3);
    const endsCluster = (e: number) => e === line.length - 1 || line[e + 1]!.x - (line[e]!.x + line[e]!.w) > h * CLUSTER_GAP;
    const text = line.map((c) => c.text).join('');
    if (text.includes(L)) continue;
    for (let a = 0; a < line.length; a++) {
      // 항목 이름 전체(한 글자 다름)
      if (a + L.length <= line.length && gapOk(a, L.length) && differsByOne(text.slice(a, a + L.length), L)) {
        for (let k = 0; k < L.length; k++) line[a + k]!.text = L[k]!;
        a += L.length - 1;
        continue;
      }
      // 두 줄로 꺾인 앞부분(낱말 끝에서 끝남)
      for (let len = L.length - 1; len >= 3; len--) {
        if (a + len > line.length || !gapOk(a, len) || !endsCluster(a + len - 1)) continue;
        if (!differsByOne(text.slice(a, a + len), L.slice(0, len))) continue;
        for (let k = 0; k < len; k++) line[a + k]!.text = L[k]!;
        a += len - 1;
        break;
      }
    }
  }
  return chars;
}

/* ── 칸에 걸친 도장(색 잉크) ────────────────────────────────────────────── */

/** 색이 뚜렷한 잉크(빨간 도장 등) — 검정·회색 글자와 표 선은 아님 */
export const INK_SATURATION = 60;

function isInk(img: ImageLike, x: number, y: number): boolean {
  const i = (y * img.width + x) * 4;
  if (img.data[i + 3]! < 128) return false;
  const r = img.data[i]!;
  const g = img.data[i + 1]!;
  const b = img.data[i + 2]!;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  // 연한 칸 배경색(파스텔)은 잉크가 아니다 — 채도 비율까지 본다
  return d >= INK_SATURATION && d / max >= 0.35;
}

/**
 * 가릴 칸 안에 색 잉크(도장·서명 이미지)가 있으면, 그 잉크와 이어진 부분이 칸 밖으로 삐져나온 데까지 넓힌다.
 * 칸 높이의 2배(최소 40px)까지만 넓힌다 — 옆 칸의 다른 색 글자를 끌고 가지 않게.
 */
export function expandWithInk(img: ImageLike, rect: Rect): Rect {
  const grow = Math.max(40, rect.h * 2);
  const wx0 = Math.max(0, Math.floor(rect.x - grow));
  const wy0 = Math.max(0, Math.floor(rect.y - grow));
  const wx1 = Math.min(img.width - 1, Math.ceil(rect.x + rect.w + grow));
  const wy1 = Math.min(img.height - 1, Math.ceil(rect.y + rect.h + grow));
  const W = wx1 - wx0 + 1;
  const seen = new Uint8Array(W * (wy1 - wy0 + 1));
  const stack: number[] = [];
  const rx0 = Math.max(wx0, Math.floor(rect.x));
  const ry0 = Math.max(wy0, Math.floor(rect.y));
  const rx1 = Math.min(wx1, Math.ceil(rect.x + rect.w) - 1);
  const ry1 = Math.min(wy1, Math.ceil(rect.y + rect.h) - 1);
  for (let y = ry0; y <= ry1; y++)
    for (let x = rx0; x <= rx1; x++)
      if (isInk(img, x, y)) {
        seen[(y - wy0) * W + (x - wx0)] = 1;
        stack.push(x, y);
      }
  if (stack.length === 0) return rect;
  let minX = rect.x;
  let minY = rect.y;
  let maxX = rect.x + rect.w;
  let maxY = rect.y + rect.h;
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + 1 > maxX) maxX = x + 1;
    if (y + 1 > maxY) maxY = y + 1;
    // 도장 테두리·글자 사이 틈(안티에일리어싱)을 건너도록 2px 이웃까지 본다
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < wx0 || ny < wy0 || nx > wx1 || ny > wy1) continue;
        const k = (ny - wy0) * W + (nx - wx0);
        if (seen[k] || !isInk(img, nx, ny)) continue;
        seen[k] = 1;
        stack.push(nx, ny);
      }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ── 가림 결과 ─────────────────────────────────────────────────────────── */

export type BlindStatus = 'full' | 'partial' | 'none';

/** 항목별(찾은 수·가린 수) → 결과. 항목을 하나도 못 찾았어도 그 항목 1건을 못 가린 것으로 센다 */
export function blindStatusOf(perLabel: { found: number; covered: number }[]): BlindStatus {
  let need = 0;
  let done = 0;
  for (const l of perLabel) {
    need += Math.max(1, l.found);
    done += Math.min(l.covered, Math.max(1, l.found));
  }
  if (done === 0) return 'none';
  return done >= need ? 'full' : 'partial';
}

/* ── 묶음 이름 ─────────────────────────────────────────────────────────── */

export type ObservationOrder = 'mentor' | 'mentee';
/** original = 원본 그대로(한글만 PDF 로) · blind = 운영기관·책임멘토명 칸 가림 */
export type ObservationMode = 'original' | 'blind';

export function observationZipBase(groupName: string, order: ObservationOrder, mode: ObservationMode): string {
  return `${cleanFile(groupName, '라운드')} 관찰의견서 ${mode === 'blind' ? '블라인드' : '원본'}(${order === 'mentor' ? '멘토별' : '멘티별'})`;
}

/** 블라인드 확인 목록의 상태 이름 */
export const BLIND_STATUS_LABEL: Record<BlindStatus, string> = { full: '가림 완료', partial: '일부 확인 필요', none: '블라인드 미적용' };

/** ZIP 맨 위(폴더 밖)에 넣는 확인 목록 파일 이름 */
export const BLIND_CHECK_LIST_NAME = '블라인드 확인 필요 목록.txt';

/** 확인 목록 내용 — 번호·파일 이름·상태·이유 (직접 가린 파일은 '직접 가림 완료') */
export function blindCheckListText(base: string, problems: { name: string; reason: string; status?: BlindStatus; fixed?: boolean }[]): string {
  const open = problems.filter((p) => !p.fixed);
  const lines = [
    `${base} — 블라인드 확인이 필요한 파일 ${open.length}개${problems.length > open.length ? ` (직접 가림 ${problems.length - open.length}개)` : ''}`,
    '아래 파일은 폴더 안에서 같은 이름으로 들어 있습니다. 열어서 "운영기관"·"책임멘토명" 칸이 가려졌는지 확인하고 직접 수정해 주세요.',
    '',
    ...problems.map((p) => `${p.name}\t${p.fixed ? '직접 가림 완료' : `${p.status ? BLIND_STATUS_LABEL[p.status] : '확인 필요'} — ${p.reason}`}`),
  ];
  return `\ufeff${lines.join('\r\n')}\r\n`;
}

/**
 * "001. 강석우멘토-남준현멘티 관찰의견서.pdf"(멘티별이면 멘티가 앞) — 원본·블라인드 같은 이름·같은 번호 (2026-11-24 사용자 요청).
 * 블라인드에서 가리지 못했거나 일부만 가린 파일은 이름을 바꾸지 않고 별도 목록(결과 창 + ZIP 안 확인 목록)으로 알린다.
 * 원본 묶음에서 한글을 PDF 로 바꾸지 못한 파일만 "(PDF 변환 실패·원본)" 표시.
 */
export function observationFileName(
  index: number,
  total: number,
  mentorName: string,
  menteeName: string,
  order: ObservationOrder,
  mode: ObservationMode,
  status: BlindStatus = 'full',
  ext = 'pdf',
): string {
  const width = Math.max(3, String(total).length);
  const mentor = `${cleanFile(mentorName, '멘토')}멘토`;
  const mentee = `${cleanFile(menteeName, '멘티')}멘티`;
  const no = String(index).padStart(width, '0');
  const pair = order === 'mentor' ? `${mentor}-${mentee}` : `${mentee}-${mentor}`;
  return `${no}. ${pair} 관찰의견서${mode === 'original' && status === 'none' ? ' (PDF 변환 실패·원본)' : ''}.${ext}`;
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
  mode: ObservationMode;
  groupName: string;
  /** 바깥 ZIP·안쪽 폴더 이름(확장자 없음) */
  base: string;
  /** 번호 순서대로 */
  items: ObservationBundleItem[];
  notes: string[];
}
