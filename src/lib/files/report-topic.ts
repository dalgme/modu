/**
 * 회차 보고서 "멘토링 주제" 칸 읽기 (2026-11-18) — 브라우저 전용. 원본 파일은 읽기만 한다.
 *  - PDF : pdf.js 글자 위치로 "멘토링 주제" 항목 → 쪽을 그려 오른쪽 칸(표 선)을 찾고 그 칸 안 글자를 모은다.
 *          표 선을 못 찾으면 같은 줄 오른쪽 글자.
 *  - 한글: rhwp 쪽 글자 배치 + 표 행·열로 바로 오른쪽 칸의 글자를 그대로 모은다.
 * 못 찾으면 null — 총괄표 [주요 내용] 칸이 비고, 운영사가 직접 채운다.
 */
import { ensureRhwp } from '@/lib/files/hwp-render';
import { cellKeyOf, cellsOf, labelCell, runsOf } from '@/lib/files/observation-redact';
import { detectRightCell, findLabelBoxes, rightCellsOf, type TextBox } from '@/lib/files/observation-redact-shared';
import { TOPIC_LABEL, joinBoxes, textInRect, textRightOf } from '@/lib/files/report-topic-shared';

const SCALE = 2;
/** 보고서 앞쪽 몇 쪽만 본다 — 주제 칸은 첫 쪽에 있다 */
const MAX_PAGES = 3;

export async function topicFromPdf(bytes: Uint8Array): Promise<string | null> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';
  const task = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', isEvalSupported: false, enableXfa: false });
  try {
    const doc = await task.promise;
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: SCALE });
      const content = await page.getTextContent();
      const boxes: TextBox[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const tx = pdfjs.Util.transform(vp.transform, item.transform) as number[];
        const fh = Math.hypot(tx[2]!, tx[3]!);
        if (!fh || Math.abs(tx[1]!) > fh * 0.05) continue;
        boxes.push({ text: item.str, x: tx[4]!, y: tx[5]! - fh * 0.85, w: item.width * SCALE, h: fh * 1.05 });
      }
      const labels = findLabelBoxes(boxes, TOPIC_LABEL);
      if (labels.length === 0) continue;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
      for (const label of labels) {
        const cell = detectRightCell(img, label);
        const text = cell ? textInRect(boxes, cell) : textRightOf(boxes, label);
        if (text) return text;
      }
    }
    return null;
  } finally {
    void task.destroy();
  }
}

export async function topicFromHwp(bytes: Uint8Array): Promise<string | null> {
  const mod = await ensureRhwp();
  const doc = new mod.HwpDocument(bytes);
  try {
    for (let p = 0; p < Math.min(doc.pageCount(), MAX_PAGES); p++) {
      const runs = runsOf(doc.getPageTextLayout(p));
      for (const label of findLabelBoxes(runs.map((r) => ({ ...r, cellKey: cellKeyOf(r) })), TOPIC_LABEL)) {
        const ref = labelCell(runs, label);
        if (ref) {
          const targets = new Set(rightCellsOf(cellsOf(doc, ref, p), ref.cell).map((c) => c.cellIdx));
          const inCell = runs.filter((r) => (r.secIdx ?? 0) === ref.sec && r.parentParaIdx === ref.para && r.controlIdx === ref.ctrl && r.cellIdx !== undefined && targets.has(r.cellIdx) && (r.cellPath ?? []).length <= 1);
          const text = joinBoxes(inCell);
          if (text) return text;
        }
        const text = textRightOf(runs, label);
        if (text) return text;
      }
    }
    return null;
  } finally {
    doc.free();
  }
}
