/**
 * 글자 인식(OCR) — 브라우저 전용 (2026-11-18, 스캔·그림 PDF 관찰의견서 블라인드).
 * tesseract.js(한국어, LSTM) 를 이 사이트에 둔 자산(public/tesseract/)으로 돌린다 — 외부 CDN 에 파일을 보내지 않는다.
 * 쪽 그림(캔버스) → 낱말 상자(TextBox, 캔버스 픽셀 좌표). 워커는 한 번 만들어 묶음이 끝날 때 closeOcr() 로 닫는다.
 */
import type { TextBox } from '@/lib/files/observation-redact-shared';

type TWorker = Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>;
let workerP: Promise<TWorker> | null = null;

function abs(p: string) {
  return new URL(p, window.location.origin).href;
}

async function getWorker(): Promise<TWorker> {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      const w = await createWorker('kor', OEM.LSTM_ONLY, {
        workerPath: abs('/tesseract/worker.min.js'),
        corePath: abs('/tesseract/core'),
        langPath: abs('/tesseract/lang'),
        gzip: true,
      });
      // 표 칸 안에 흩어진 짧은 글자(항목 이름)를 빠짐없이 — 문단 단위가 아니라 흩어진 글자 모드
      await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return w;
    })();
    workerP.catch(() => {
      workerP = null;
    });
  }
  return workerP;
}

interface OcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBbox;
  symbols?: { text: string; bbox: OcrBbox }[];
}

/** 어둡게 볼 밝기(흑백으로 바꿀 때) · 표 선으로 지울 최소 길이(쪽 폭 대비) */
const INK_LUMA = 160;
const LINE_MIN_FRAC = 0.04;

/**
 * 글자 인식 전처리 — 흑백으로 바꾸고 긴 가로·세로 선(표 선)을 지운다.
 * 표 선이 남아 있으면 글자 인식이 칸 안 글자를 통째로 건너뛴다(스캔 관찰의견서 시험에서 확인).
 */
function cleanForOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width;
  const H = src.height;
  const data = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data;
  const ink = new Uint8Array(W * H);
  for (let i = 0, p = 0; p < W * H; p++, i += 4) ink[p] = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]! < INK_LUMA ? 1 : 0;
  const keep = ink.slice();
  const minLen = Math.max(30, Math.round(W * LINE_MIN_FRAC));
  // 가로 선: 한 줄에서 이어진 어두운 구간이 minLen 이상(위아래 1px 흔들림 허용)
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x <= W; x++) {
      const d = x < W && (ink[y * W + x] || (y > 0 && ink[(y - 1) * W + x]) || (y < H - 1 && ink[(y + 1) * W + x]));
      if (d) run++;
      else {
        if (run >= minLen) for (let k = x - run; k < x; k++) for (let dy = -1; dy <= 1; dy++) if (y + dy >= 0 && y + dy < H) keep[(y + dy) * W + k] = 0;
        run = 0;
      }
    }
  }
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y <= H; y++) {
      const d = y < H && (ink[y * W + x] || (x > 0 && ink[y * W + x - 1]) || (x < W - 1 && ink[y * W + x + 1]));
      if (d) run++;
      else {
        if (run >= minLen) for (let k = y - run; k < y; k++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < W) keep[k * W + x + dx] = 0;
        run = 0;
      }
    }
  }
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d')!;
  const im = ctx.createImageData(W, H);
  for (let p = 0, i = 0; p < W * H; p++, i += 4) {
    const v = keep[p] ? 0 : 255;
    im.data[i] = v;
    im.data[i + 1] = v;
    im.data[i + 2] = v;
    im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  return out;
}

/** 쪽 그림의 낱말 상자들(캔버스 픽셀 좌표) — 글자별 경계(charX)는 글자 수가 맞을 때만 */
export async function ocrWords(canvas: HTMLCanvasElement): Promise<TextBox[]> {
  const w = await getWorker();
  const clean = cleanForOcr(canvas);
  const { data } = await w.recognize(clean, {}, { blocks: true, text: false });
  clean.width = 0;
  clean.height = 0;
  const out: TextBox[] = [];
  for (const block of data.blocks ?? [])
    for (const para of block.paragraphs ?? [])
      for (const line of para.lines ?? [])
        for (const word of (line.words ?? []) as OcrWord[]) {
          const text = (word.text ?? '').trim();
          if (!text) continue;
          const { x0, y0, x1, y1 } = word.bbox;
          if (x1 <= x0 || y1 <= y0) continue;
          const syms = word.symbols ?? [];
          const charX = syms.length === text.length && syms.length > 0 ? [...syms.map((s) => s.bbox.x0 - x0), syms[syms.length - 1]!.bbox.x1 - x0] : undefined;
          out.push({ text, x: x0, y: y0, w: x1 - x0, h: y1 - y0, charX });
        }
  return out;
}

export async function closeOcr(): Promise<void> {
  const p = workerP;
  workerP = null;
  if (!p) return;
  try {
    await (await p).terminate();
  } catch {
    /* 이미 닫힘 */
  }
}
