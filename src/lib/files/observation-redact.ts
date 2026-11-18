/**
 * 관찰의견서 사본의 "운영기관"·"책임멘토명" 오른쪽 칸 가리기 (2026-11-17, 11-18 책임멘토명·도장) — 브라우저 전용.
 * 원본 파일·저장소는 그대로 두고, 받아 온 사본으로 새 PDF 를 만든다.
 *
 *  - PDF : pdf.js 로 쪽 글자 위치를 읽어 "운영기관"을 찾고, 그 쪽만 그림으로 그려 오른쪽 칸(표 선 기준)을 검게 칠한 뒤
 *          그림으로 넣는다(그 쪽은 글자 층이 없어져 복사·검색으로 내용이 새지 않음). 다른 쪽은 원본 그대로 복사.
 *  - 한글: rhwp 로 문서를 열어(메모리 사본) 오른쪽 칸의 글자를 지운 뒤 쪽을 그리고, 같은 칸 위치를 검게 칠해
 *          쪽 그림으로 PDF 를 만든다. 중첩 표 등 칸 정보가 없으면 PDF 와 같은 표 선 방식으로 찾는다.
 * 결과 상태: full = 찾은 라벨 모두 가림 · partial = 일부만 · none = 못 가림(라벨·표를 찾지 못함).
 */
import { ensureRhwp, renderHwpPages } from '@/lib/files/hwp-render';
import { REDACT_LABELS, blindStatusOf, detectRightCell, expandWithInk, findLabelBoxes, rightCellsOf, type BlindStatus, type CellBox, type Rect, type TextBox } from '@/lib/files/observation-redact-shared';

export interface RedactOutcome {
  pdf: Uint8Array;
  status: BlindStatus;
  /** 가린 칸 수 / 찾은 라벨 수 */
  covered: number;
  found: number;
}

/** PDF 쪽을 그릴 배율 — 3 ≈ 216dpi(얇은 표 선도 진하게 잡힌다) */
const PDF_SCALE = 3;
/** 한글 쪽 배율 — hwp-render 와 같은 2 */
const HWP_SCALE = 2;
const JPEG_QUALITY = 0.85;
const PX_TO_PT = 0.75;

/** 항목별 집계 → 결과 상태 */
type Tally = Map<string, { found: number; covered: number }>;
const newTally = (): Tally => new Map(REDACT_LABELS.map((l) => [l, { found: 0, covered: 0 }]));
const tallyStatus = (t: Tally): BlindStatus => blindStatusOf(Array.from(t.values()));
const tallySum = (t: Tally, k: 'found' | 'covered') => Array.from(t.values()).reduce((n, v) => n + v[k], 0);

function toJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? b.arrayBuffer().then((x) => resolve(new Uint8Array(x)), reject) : reject(new Error('이미지 변환 실패'))), 'image/jpeg', JPEG_QUALITY),
  );
}

/** 검게 칠하기 — 칸 테두리 안쪽까지 빠짐없이(1px 넉넉히) */
function blackOut(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.fillStyle = '#000';
  ctx.fillRect(Math.floor(r.x) - 1, Math.floor(r.y) - 1, Math.ceil(r.w) + 2, Math.ceil(r.h) + 2);
}

/* ── PDF ─────────────────────────────────────────────────────────────── */

export async function redactPdf(bytes: Uint8Array): Promise<RedactOutcome> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';
  const task = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', isEvalSupported: false, enableXfa: false });
  const doc = await task.promise;
  const tally = newTally();
  const imagePages = new Map<number, { jpg: Uint8Array; w: number; h: number }>();
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: PDF_SCALE });
      const content = await page.getTextContent();
      const boxes: TextBox[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const tx = pdfjs.Util.transform(vp.transform, item.transform) as number[];
        const fh = Math.hypot(tx[2]!, tx[3]!);
        if (!fh || Math.abs(tx[1]!) > fh * 0.05) continue; // 세로·기울어진 글자는 건너뜀
        boxes.push({ text: item.str, x: tx[4]!, y: tx[5]! - fh * 0.85, w: item.width * PDF_SCALE, h: fh * 1.05 });
      }
      const labels = REDACT_LABELS.flatMap((name) => findLabelBoxes(boxes, name).map((rect) => ({ name, rect })));
      if (labels.length === 0) continue;
      for (const l of labels) tally.get(l.name)!.found += 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // 모든 칸을 깨끗한 그림에서 먼저 찾고(앞서 칠한 검은 칸이 다음 칸 찾기를 방해하지 않게) 한꺼번에 칠한다
      const hits: Rect[] = [];
      for (const l of labels) {
        const cell = detectRightCell(img, l.rect);
        if (!cell) continue;
        tally.get(l.name)!.covered += 1;
        hits.push(expandWithInk(img, cell));
      }
      if (hits.length === 0) continue;
      for (const r of hits) blackOut(ctx, r);
      const vp1 = page.getViewport({ scale: 1 });
      imagePages.set(n - 1, { jpg: await toJpeg(canvas), w: vp1.width, h: vp1.height });
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    void task.destroy();
  }
  const status = tallyStatus(tally);
  const covered = tallySum(tally, 'covered');
  const found = tallySum(tally, 'found');
  if (imagePages.size === 0) return { pdf: bytes, status, covered, found };

  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  for (let i = 0; i < total; i++) {
    const im = imagePages.get(i);
    if (im) {
      const jpg = await out.embedJpg(im.jpg);
      out.addPage([im.w, im.h]).drawImage(jpg, { x: 0, y: 0, width: im.w, height: im.h });
    } else {
      const [p] = await out.copyPages(src, [i]);
      out.addPage(p!);
    }
  }
  return { pdf: await out.save(), status, covered, found };
}

/* ── 한글(HWP·HWPX) ──────────────────────────────────────────────────── */

export interface LayoutRun {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  charX?: number[];
  secIdx?: number;
  parentParaIdx?: number;
  controlIdx?: number;
  cellIdx?: number;
  cellPath?: unknown[];
}

export interface CellRef {
  sec: number;
  para: number;
  ctrl: number;
  cell: number;
}

export const cellKeyOf = (r: LayoutRun) => (r.cellIdx === undefined ? undefined : `${r.secIdx ?? 0}:${r.parentParaIdx}:${r.controlIdx}:${r.cellIdx}:${(r.cellPath ?? []).length}`);

export function runsOf(json: string): LayoutRun[] {
  try {
    const v = JSON.parse(json) as { runs?: LayoutRun[] };
    return Array.isArray(v.runs) ? v.runs : [];
  } catch {
    return [];
  }
}

/** 라벨 상자와 겹치는 첫 칸 글자(최상위 표 칸만 — 중첩 표는 null) */
export function labelCell(runs: LayoutRun[], label: Rect): CellRef | null {
  const cx = label.x + Math.min(label.w, 4) / 2;
  const cy = label.y + label.h / 2;
  const r = runs.find((x) => x.cellIdx !== undefined && cx >= x.x - 1 && cx <= x.x + x.w + 1 && cy >= x.y - 1 && cy <= x.y + x.h + 1);
  if (!r || (r.cellPath ?? []).length > 1 || r.parentParaIdx === undefined || r.controlIdx === undefined) return null;
  return { sec: r.secIdx ?? 0, para: r.parentParaIdx, ctrl: r.controlIdx, cell: r.cellIdx! };
}

export function cellsOf(doc: { getTableCellBboxes(s: number, p: number, c: number, hint?: number | null): string }, ref: Omit<CellRef, 'cell'>, page: number): CellBox[] {
  try {
    const v = JSON.parse(doc.getTableCellBboxes(ref.sec, ref.para, ref.ctrl, page)) as CellBox[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function redactHwp(bytes: Uint8Array): Promise<RedactOutcome> {
  const mod = await ensureRhwp();
  const doc = new mod.HwpDocument(bytes);
  try {
    // 1) 라벨 칸 → 오른쪽 칸(표 행·열) 찾고, 그 칸의 글자를 메모리 사본에서 지운다
    const targets = new Map<string, CellRef>();
    const labelTargets = new Map<string, string[]>(); // 라벨 칸 → 대상 칸들
    const pages0 = doc.pageCount();
    for (let p = 0; p < pages0; p++) {
      const runs = runsOf(doc.getPageTextLayout(p));
      for (const { rect: label } of REDACT_LABELS.flatMap((name) => findLabelBoxes(runs.map((r) => ({ ...r, cellKey: cellKeyOf(r) })), name).map((rect) => ({ name, rect })))) {
        const ref = labelCell(runs, label);
        if (!ref) continue;
        const lk = `${ref.sec}:${ref.para}:${ref.ctrl}:${ref.cell}`;
        if (labelTargets.has(lk)) continue;
        const keys: string[] = [];
        for (const c of rightCellsOf(cellsOf(doc, ref, p), ref.cell)) {
          const t = { ...ref, cell: c.cellIdx };
          const tk = `${t.sec}:${t.para}:${t.ctrl}:${t.cell}`;
          targets.set(tk, t);
          keys.push(tk);
        }
        labelTargets.set(lk, keys);
      }
    }
    for (const t of Array.from(targets.values())) {
      try {
        const paras = doc.getCellParagraphCount(t.sec, t.para, t.ctrl, t.cell);
        for (let cp = paras - 1; cp >= 0; cp--) {
          const len = doc.getCellParagraphLength(t.sec, t.para, t.ctrl, t.cell, cp);
          if (len > 0) doc.deleteTextInCell(t.sec, t.para, t.ctrl, t.cell, cp, 0, len);
        }
      } catch {
        /* 지우지 못해도 아래에서 칸 위치를 검게 칠한다 */
      }
    }

    // 2) 지운 뒤 다시 배치된 쪽을 그리고, 대상 칸(정확) 또는 표 선(대체)으로 검게 칠한다
    const { PDFDocument } = await import('pdf-lib');
    const out = await PDFDocument.create();
    const tally = newTally();
    const n = doc.pageCount();
    if (!n) throw new Error('페이지 없음');
    for (let p = 0; p < n; p++) {
      const canvas = document.createElement('canvas');
      doc.renderPageToCanvas(p, canvas, HWP_SCALE);
      if (!canvas.width || !canvas.height) throw new Error(`${p + 1}쪽을 그리지 못함`);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      // rhwp 가 배율 변환을 걸어 둔 채로 끝난다 — 칠하기는 캔버스 픽셀 좌표로
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const runs = runsOf(doc.getPageTextLayout(p));
      const labels = REDACT_LABELS.flatMap((name) => findLabelBoxes(runs.map((r) => ({ ...r, cellKey: cellKeyOf(r) })), name).map((rect) => ({ name, rect })));
      if (labels.length > 0) {
        // 깨끗한 쪽 그림에서 모든 칸·도장을 먼저 찾고 한꺼번에 칠한다
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hits: Rect[] = [];
        for (const { name, rect: label } of labels) {
          const t = tally.get(name)!;
          t.found += 1;
          const ref = labelCell(runs, label);
          const keys = ref ? labelTargets.get(`${ref.sec}:${ref.para}:${ref.ctrl}:${ref.cell}`) ?? [] : [];
          const exact = ref
            ? cellsOf(doc, ref, p).filter((c) => (c.pageIndex === undefined || c.pageIndex === p) && keys.includes(`${ref.sec}:${ref.para}:${ref.ctrl}:${c.cellIdx}`))
            : [];
          if (exact.length > 0) {
            for (const c of exact) hits.push(expandWithInk(img, { x: c.x * HWP_SCALE, y: c.y * HWP_SCALE, w: c.w * HWP_SCALE, h: c.h * HWP_SCALE }));
            t.covered += 1;
            continue;
          }
          const cell = detectRightCell(img, { x: label.x * HWP_SCALE, y: label.y * HWP_SCALE, w: label.w * HWP_SCALE, h: label.h * HWP_SCALE });
          if (cell) {
            hits.push(expandWithInk(img, cell));
            t.covered += 1;
          }
        }
        for (const r of hits) blackOut(ctx, r);
      }
      const jpg = await out.embedJpg(await toJpeg(canvas));
      const w = (canvas.width / HWP_SCALE) * PX_TO_PT;
      const h = (canvas.height / HWP_SCALE) * PX_TO_PT;
      out.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
      canvas.width = 0;
      canvas.height = 0;
      await new Promise((r) => setTimeout(r, 0));
    }
    return { pdf: await out.save(), status: tallyStatus(tally), covered: tallySum(tally, 'covered'), found: tallySum(tally, 'found') };
  } finally {
    doc.free();
  }
}

/* ── 원본(가림 없음): 한글만 PDF 로 ───────────────────────────────────── */

/** 한글(HWP·HWPX) → PDF(쪽 그림). 가림 없이 원본 모양 그대로 — 원본 묶음용 */
export async function hwpToPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const pages = await renderHwpPages(bytes);
  if (pages.length === 0) throw new Error('빈 문서');
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const pg of pages) {
    const img = pg.format === 'png' ? await out.embedPng(pg.bytes) : await out.embedJpg(pg.bytes);
    out.addPage([pg.widthPt, pg.heightPt]).drawImage(img, { x: 0, y: 0, width: pg.widthPt, height: pg.heightPt });
  }
  return out.save();
}
