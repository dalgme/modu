/**
 * 한글(HWP·HWPX) → 페이지 이미지 (2026-10-27) — 브라우저 전용. rhwp(@rhwp/core, MIT, Rust+WASM)로
 * 페이지마다 캔버스에 그린 뒤 JPEG 로 뽑는다. 제출용 묶음이 이 이미지를 PDF 페이지로 넣는다.
 *  - 글꼴: 이 브라우저(PC)에 설치된 글꼴로 그린다. 한컴 전용 글꼴이 없으면 rhwp 가 비슷한 글꼴로 바꿔 그려
 *    줄바꿈·간격이 원본과 조금 다를 수 있다.
 *  - 암호·배포용·손상 문서는 예외를 던진다 → 호출부가 원본 파일을 함께 넣는다.
 *  - WASM(약 12MB)은 처음 한 번만 받고 브라우저가 캐시한다.
 */
import type { RenderedPage } from '@/lib/files/round-package-build';

/** 캔버스 배율 — 2 = 약 192dpi(인쇄 판독 충분), JPEG 품질 0.8 */
const SCALE = 2;
const QUALITY = 0.8;
/** 96dpi 픽셀 → PDF 포인트 */
const PX_TO_PT = 0.75;

type RhwpModule = typeof import('@rhwp/core');
let ready: Promise<RhwpModule> | null = null;

function ensureRhwp(): Promise<RhwpModule> {
  if (!ready) {
    ready = (async () => {
      const g = globalThis as unknown as { measureTextWidth?: (font: string, text: string) => number };
      if (!g.measureTextWidth) {
        // rhwp 가 줄바꿈·정렬을 계산할 때 쓰는 글자 폭 측정 (WASM 초기화 전에 등록해야 한다)
        let ctx: CanvasRenderingContext2D | null = null;
        let last = '';
        g.measureTextWidth = (font, text) => {
          if (!ctx) ctx = document.createElement('canvas').getContext('2d');
          if (!ctx) return text.length * 10;
          if (font !== last) {
            ctx.font = font;
            last = font;
          }
          return ctx.measureText(text).width;
        };
      }
      const mod = await import('@rhwp/core');
      await mod.default();
      return mod;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject) : reject(new Error('이미지 변환 실패'))),
      'image/jpeg',
      QUALITY,
    ),
  );
}

export async function renderHwpPages(bytes: Uint8Array): Promise<RenderedPage[]> {
  const mod = await ensureRhwp();
  const doc = new mod.HwpDocument(bytes);
  try {
    const n = doc.pageCount();
    if (!n) throw new Error('페이지 없음');
    const pages: RenderedPage[] = [];
    for (let i = 0; i < n; i++) {
      const canvas = document.createElement('canvas');
      doc.renderPageToCanvas(i, canvas, SCALE);
      if (!canvas.width || !canvas.height) throw new Error(`${i + 1}쪽을 그리지 못함`);
      pages.push({ bytes: await canvasJpeg(canvas), format: 'jpg', widthPt: (canvas.width / SCALE) * PX_TO_PT, heightPt: (canvas.height / SCALE) * PX_TO_PT });
      canvas.width = 0;
      canvas.height = 0;
      // 큰 문서에서 화면이 멈추지 않게 한 쪽마다 숨 돌리기
      await new Promise((r) => setTimeout(r, 0));
    }
    return pages;
  } finally {
    doc.free();
  }
}
