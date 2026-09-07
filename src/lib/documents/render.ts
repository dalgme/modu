import 'server-only';

import {
  MALGUN_REGULAR_WOFF2_BASE64,
  MALGUN_BOLD_WOFF2_BASE64,
  HCR_BATANG_WOFF2_BASE64,
  HCR_DOTUM_WOFF2_BASE64,
} from '@/lib/documents/korean-font-data';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 플레이스홀더를 데이터로 치환한다.
 *  - {{{key}}} : 원시(raw) 삽입 — 이미지 data:URI·서명 등 신뢰된 HTML 조각용 (이스케이프 안 함)
 *  - {{key}}   : HTML 이스케이프 삽입 (기본, 사용자 데이터용)
 * 붙임서식 HTML 템플릿에 케이스 데이터를 주입하는 용도.
 */
export function renderTemplate(html: string, data: Record<string, string | number | null>): string {
  return html
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, key: string) => {
      const raw = data[key];
      return raw === null || raw === undefined ? '' : String(raw);
    })
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
      const raw = data[key];
      if (raw === null || raw === undefined) return '';
      return escapeHtml(String(raw));
    });
}

/**
 * 한글 폰트 임베드 (기관 제공, 한글 서브셋 · 네트워크 의존 없음).
 * 서버리스 Chromium 에는 한글 폰트가 없어 한글이 빈칸으로 렌더되고 표 레이아웃이 붕괴된다.
 * 공고문 원본과 동일한 실제 폰트를 실이름으로 @font-face 임베드한다.
 *  - '맑은 고딕' / 'Malgun Gothic' (본문·표 기본)
 *  - '함초롬바탕' (HWP 명조), '함초롬돋움' (HWP 고딕) — 템플릿에서 font-family 로 선택 가능
 * html 기본값만 지정하고(!important 미사용) 템플릿이 원하는 폰트를 지정하면 그대로 사용된다.
 */
const FONT_STYLE = `
<style id="__kr_font__">
@font-face{font-family:'맑은 고딕';font-weight:400;font-display:block;src:url(data:font/woff2;base64,${MALGUN_REGULAR_WOFF2_BASE64}) format('woff2');}
@font-face{font-family:'맑은 고딕';font-weight:700;font-display:block;src:url(data:font/woff2;base64,${MALGUN_BOLD_WOFF2_BASE64}) format('woff2');}
@font-face{font-family:'Malgun Gothic';font-weight:400;font-display:block;src:url(data:font/woff2;base64,${MALGUN_REGULAR_WOFF2_BASE64}) format('woff2');}
@font-face{font-family:'Malgun Gothic';font-weight:700;font-display:block;src:url(data:font/woff2;base64,${MALGUN_BOLD_WOFF2_BASE64}) format('woff2');}
@font-face{font-family:'함초롬바탕';font-weight:400 700;font-display:block;src:url(data:font/woff2;base64,${HCR_BATANG_WOFF2_BASE64}) format('woff2');}
@font-face{font-family:'함초롬돋움';font-weight:400 700;font-display:block;src:url(data:font/woff2;base64,${HCR_DOTUM_WOFF2_BASE64}) format('woff2');}
html{font-family:'맑은 고딕','함초롬돋움',sans-serif;}
</style>`;

function injectFont(html: string): string {
  if (html.includes('</head>')) return html.replace('</head>', `${FONT_STYLE}</head>`);
  if (html.includes('<body')) return html.replace('<body', `${FONT_STYLE}<body`);
  return FONT_STYLE + html;
}

/**
 * HTML → PDF 렌더링 (Playwright/Chromium).
 * 로컬: PLAYWRIGHT_BROWSERS_PATH 로 사전 설치된 크로미움 사용.
 * Vercel: CHROMIUM_EXECUTABLE_PATH 환경변수로 @sparticuz/chromium 바이너리 지정.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const { chromium } = await import('playwright-core');

  let executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || undefined;
  let launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];

  // Vercel 서버리스: @sparticuz/chromium 바이너리 사용
  if (!executablePath && process.env.VERCEL) {
    const sparticuz = (await import('@sparticuz/chromium')).default;
    executablePath = await sparticuz.executablePath();
    launchArgs = sparticuz.args;
  }

  let browser;
  try {
    browser = await chromium.launch({ executablePath, args: launchArgs });
  } catch (err) {
    console.error('[htmlToPdf] chromium launch 실패', {
      vercel: !!process.env.VERCEL,
      executablePath,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
  try {
    const page = await browser.newPage();
    // 폰트는 전부 inline data:URI 라 외부 네트워크 요청이 없다 → 'load' 로 충분하고 더 빠르다
    // (networkidle 대기 제거). 한글 렌더는 아래 fonts.ready 로 보장한다.
    await page.setContent(injectFont(html), { waitUntil: 'load' });
    // 웹폰트 로딩 완료까지 대기 (한글 렌더 보장)
    try {
      await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    } catch {
      /* 폰트 API 미지원 등 무시 */
    }
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
