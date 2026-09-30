'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, ExternalLink, Loader2, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import type { HwpxResult } from '@/lib/files/hwpx';
import { docFileHref, PREVIEW_NOTES, previewKind, sniffKind, viewerPageHref, type PreviewKind, type PreviewMeta, type PreviewText } from '@/lib/files/preview-kind';
import { cn } from '@/lib/utils';

/**
 * 업로드 파일 웹 미리보기 (2026-09-30 전면 보완)
 *
 * 흐름: [미리보기] → 미리보기 계약(meta, `GET …?meta=1`)을 받고 → meta.url(짧은 인라인 서명 URL)에서 바이트를 직접 읽어 →
 *       앞머리 바이트(매직 넘버)로 형식을 판정해 브라우저 안에서 그린다. 권한·다운로드 허용 여부는 서버(meta)가 정한다.
 *  - PDF       : pdf.js(자체 호스팅 워커 /pdfjs/)로 캔버스에 쪽마다 그린다 — 폰에서도 전 쪽이 보이고, 브라우저 PDF 도구(인쇄·저장)가 없다
 *  - 이미지     : <img>
 *  - DOCX      : docx-preview (실패 시 서버 글자 추출)
 *  - HWP(5.x)  : hwp.js 로 그려 보고, 실패하거나 글자가 없으면 서버 글자 추출(textUrl)
 *  - HWPX      : 문단 + 표(셀 병합 포함), 그림은 자리 표시만
 *  - DOC(97~2003): 서버 글자 추출
 *  - 엑셀·CSV  : 첫 시트 표 / 텍스트 파일: 글자
 *
 * [새 창] = 플랫폼 자체 뷰어 페이지(/files/view) — 원본 파일 주소를 새 탭에 열지 않는다(브라우저 PDF 뷰어의 저장·인쇄 버튼이 생기므로).
 * 미리보기 전용(meta.downloadUrl = null 또는 allowDownload=false): [다운로드] 없음, 우클릭·끌기·길게 눌러 저장·글자 선택 차단,
 * 창이 열려 있는 동안 인쇄(Ctrl+P·브라우저 메뉴) 결과를 "인쇄가 제한된 문서입니다" 한 줄로 바꾼다.
 * ※ 화면 캡처·휴대폰 촬영·개발자 도구로 바이트를 가로채는 것까지 막을 수는 없다 — 일반 사용자의 저장·인쇄를 막는 억제 장치다.
 *
 * 서버 컴포넌트에서 넘기는 props 는 문자열·불리언만(CLAUDE.md §6-10).
 */

type Size = 'sm' | 'xs';

interface SourceProps {
  /** 문서(documents) id — `/api/files/doc/{docId}?meta=1` 로 미리보기 계약을 받는다 */
  docId?: string;
  /** docId 대신 같은 계약(PreviewMeta)을 돌려주는 다른 라우트 주소(예: 멘토 지급서류) */
  metaUrl?: string;
}

const PRINT_BLOCK_CLASS = 'modu-print-block';
/** 미리보기 전용 창이 열려 있는 동안 인쇄 결과를 안내 문구로 바꾼다 (Radix 대화상자는 body 직속 포털이라 body > * 로 전부 가려진다) */
const PRINT_BLOCK_CSS = `@media print{html.${PRINT_BLOCK_CLASS} body>*{display:none!important}html.${PRINT_BLOCK_CLASS} body::before{content:"인쇄가 제한된 문서입니다.";display:block;padding:2rem;font-size:16pt;color:#000}}`;

/** 미리보기로 받아올 최대 크기 — 넘으면 다운로드 안내 */
const MAX_PREVIEW_BYTES = 60 * 1024 * 1024;

function metaHref({ docId, metaUrl }: SourceProps): string | null {
  if (metaUrl) return metaUrl;
  return docId ? docFileHref(docId, 'meta') : null;
}

async function loadMeta(href: string): Promise<PreviewMeta> {
  const res = await fetch(href, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      res.status === 401 ? '로그인이 필요합니다. 다시 로그인해 주세요.' : res.status === 403 ? '이 파일을 볼 권한이 없습니다.' : res.status === 404 ? '파일을 찾을 수 없습니다.' : '파일 정보를 불러오지 못했습니다.',
    );
  }
  return (await res.json()) as PreviewMeta;
}

/** 바이트 읽기 자체가 막힌 경우(네트워크·CORS) — 태그 로딩(<img>/<iframe>)이나 서버 글자 추출로 대체할 수 있다 */
class FetchBlockedError extends Error {}

/** 서명 URL(스토리지, 다른 출처)에서 바이트를 직접 읽는다 — 쿠키를 보내지 않는다 */
async function fetchBytes(url: string): Promise<ArrayBuffer> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
  } catch {
    throw new FetchBlockedError('파일을 불러오지 못했습니다(네트워크 또는 저장소 접속 오류). 잠시 후 다시 열어 주세요.');
  }
  if (!res.ok) throw new Error(res.status === 400 || res.status === 403 ? '미리보기 주소가 만료됐습니다. 창을 닫고 다시 열어 주세요.' : '파일을 불러오지 못했습니다.');
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_PREVIEW_BYTES) throw new Error('파일이 커서(60MB 초과) 웹 미리보기를 할 수 없습니다.');
  return res.arrayBuffer();
}

async function loadText(textUrl: string): Promise<PreviewText> {
  const res = await fetch(textUrl, { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 403 ? '이 파일을 볼 권한이 없습니다.' : '문서 글자를 읽지 못했습니다.');
  return (await res.json()) as PreviewText;
}

/** 넓은 문서(Word·한글 쪽 너비 21cm 등)를 화면 너비에 맞춘다 — 넓을 때만 축소 */
function fitWidth(box: HTMLElement, inner: HTMLElement | null) {
  if (!inner) return;
  inner.style.removeProperty('zoom');
  const avail = box.clientWidth;
  const need = inner.scrollWidth;
  if (avail > 0 && need > avail + 4) inner.style.setProperty('zoom', String(Math.max(0.3, avail / need)));
}

function guessImageMime(u8: Uint8Array, fallback: string | null): string {
  if (u8[0] === 0x89 && u8[1] === 0x50) return 'image/png';
  if (u8[0] === 0xff && u8[1] === 0xd8) return 'image/jpeg';
  if (u8[0] === 0x47 && u8[1] === 0x49) return 'image/gif';
  if (u8[0] === 0x52 && u8[1] === 0x49) return 'image/webp';
  if (u8[0] === 0x42 && u8[1] === 0x4d) return 'image/bmp';
  return fallback && fallback.startsWith('image/') ? fallback : 'application/octet-stream';
}

function decodeText(buf: ArrayBuffer): string {
  const slice = buf.byteLength > 2 * 1024 * 1024 ? buf.slice(0, 2 * 1024 * 1024) : buf;
  const utf8 = new TextDecoder('utf-8').decode(slice);
  // 깨진 글자가 많으면 한국어 윈도 인코딩(CP949)으로 다시 읽는다
  if ((utf8.match(/�/g)?.length ?? 0) > 5) {
    try {
      return new TextDecoder('euc-kr').decode(slice);
    } catch {
      /* 지원 안 하는 브라우저 — UTF-8 그대로 */
    }
  }
  return utf8;
}

// ───────────────────────── 형식별 화면 ─────────────────────────

/** PDF — pdf.js 로 쪽마다 캔버스에 그린다. 화면 가까이 온 쪽만 차례로 그린다(긴 문서·폰 메모리 보호) */
function PdfView({ data, onError }: { data: Uint8Array; onError: (msg: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<{ pages: number; rendered: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let destroy: (() => void) | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';
        const task = pdfjs.getDocument({
          data: data.slice(), // 워커로 넘기면 원본 버퍼가 비워지므로 복사본을 준다
          cMapUrl: '/pdfjs/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/pdfjs/standard_fonts/',
          isEvalSupported: false,
          enableXfa: false,
        });
        destroy = () => void task.destroy();
        const doc = await task.promise;
        if (cancelled || !pagesRef.current || !scrollRef.current) return;
        const first = await doc.getPage(1);
        const base = first.getViewport({ scale: 1 });
        const box = pagesRef.current;
        box.innerHTML = '';
        const holders: HTMLDivElement[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const holder = document.createElement('div');
          holder.dataset.page = String(i);
          holder.className = 'relative mx-auto mb-3 w-full bg-white shadow-sm';
          holder.style.aspectRatio = `${base.width} / ${base.height}`;
          box.appendChild(holder);
          holders.push(holder);
        }
        setInfo({ pages: doc.numPages, rendered: 0 });

        let rendered = 0;
        let chain: Promise<void> = Promise.resolve();
        const done = new Set<number>();
        const renderPage = (n: number) => {
          if (done.has(n)) return;
          done.add(n);
          chain = chain.then(async () => {
            if (cancelled) return;
            const holder = holders[n - 1]!;
            const page = n === 1 ? first : await doc.getPage(n);
            const vp1 = page.getViewport({ scale: 1 });
            holder.style.aspectRatio = `${vp1.width} / ${vp1.height}`;
            const cssWidth = holder.clientWidth || box.clientWidth || 800;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            let scale = (cssWidth / vp1.width) * dpr;
            // 캔버스 최대 픽셀(iOS 약 1,670만) 보호
            const maxPixels = 12_000_000;
            if (vp1.width * vp1.height * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (vp1.width * vp1.height));
            const vp = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(vp.width);
            canvas.height = Math.floor(vp.height);
            canvas.className = 'block h-auto w-full select-none';
            canvas.draggable = false;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            if (cancelled) return;
            holder.replaceChildren(canvas);
            rendered++;
            setInfo({ pages: doc.numPages, rendered });
          });
          chain = chain.catch(() => {
            /* 한 쪽 실패는 빈 쪽으로 둔다 */
          });
        };
        observer = new IntersectionObserver(
          (entries) => {
            for (const e of entries) if (e.isIntersecting) renderPage(Number((e.target as HTMLElement).dataset.page));
          },
          { root: scrollRef.current, rootMargin: '1200px 0px' },
        );
        holders.forEach((h) => observer!.observe(h));
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        onError(name === 'PasswordException' ? '암호가 걸린 PDF 라 미리보기를 할 수 없습니다.' : 'PDF 를 읽지 못했습니다. 파일이 손상됐을 수 있습니다.');
      }
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      destroy?.();
    };
  }, [data, onError]);

  return (
    <div ref={scrollRef} className="absolute inset-0 overflow-auto bg-muted/40 p-2 sm:p-4">
      <div ref={pagesRef} className="mx-auto max-w-4xl" />
      {info && (
        <p className="pointer-events-none sticky bottom-1 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-[11px] text-white">
          전체 {info.pages}쪽{info.rendered < info.pages ? ` · 스크롤하면 이어서 그립니다` : ''}
        </p>
      )}
    </div>
  );
}

/** DOCX — docx-preview. 실패하면 서버 글자 추출로 */
function DocxView({ data, onFail }: { data: ArrayBuffer; onFail: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        const box = boxRef.current;
        if (!box || cancelled) return;
        box.innerHTML = '';
        await renderAsync(data, box, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true, breakPages: true, renderHeaders: true, renderFooters: true });
        if (cancelled) return;
        if (!box.textContent?.trim() && !box.querySelector('img')) throw new Error('empty');
        fitWidth(box, box.querySelector<HTMLElement>('.docx-wrapper'));
        setBusy(false);
      } catch {
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, onFail]);
  return (
    <>
      {busy && <Spinner />}
      <div ref={boxRef} className="min-h-full bg-muted/40 text-black [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-2 sm:[&_.docx-wrapper]:p-4" />
    </>
  );
}

/** HWP(5.x) — hwp.js 로 그려 보고, 실패하거나 글자가 없으면 서버 글자 추출로 */
function HwpView({ data, onFail }: { data: Uint8Array; onFail: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    (async () => {
      try {
        // hwp.js 는 브라우저 전용·무거운 라이브러리 — 필요할 때만 불러온다
        const mod = (await import('hwp.js')) as unknown as {
          Viewer: new (el: HTMLElement, data: Uint8Array, opt?: { type: 'array' | 'binary' }) => { distory?: () => void };
        };
        const box = boxRef.current;
        if (!box || cancelled) return;
        box.innerHTML = '';
        // 그리기 전에 한 프레임 양보(로딩 표시가 먼저 보이도록) — 큰 문서는 그리는 동안 화면이 잠깐 멈출 수 있다
        await new Promise((r) => setTimeout(r, 30));
        const v = new mod.Viewer(box, data, { type: 'array' });
        destroy = () => v.distory?.();
        const viewer = box.firstElementChild as HTMLElement | null;
        if (!viewer) throw new Error('empty');
        // hwp.js 자체 머리줄(쪽 번호·정보·인쇄 버튼)을 없앤다 — 인쇄 버튼은 자체 인쇄 경로라 인쇄 차단을 우회한다
        const kids = Array.from(viewer.children) as HTMLElement[];
        const content = kids[kids.length - 1];
        kids.slice(0, -1).forEach((k) => k.remove());
        viewer.style.height = 'auto';
        viewer.style.overflow = 'visible';
        if (content) {
          content.style.height = 'auto';
          content.style.overflow = 'visible';
          content.style.padding = '16px 8px';
          // hwp.js 는 구역마다 한 쪽 높이로 고정해 긴 본문이 쪽 밖으로 넘친다 — 높이를 풀어 준다
          for (const page of Array.from(content.children) as HTMLElement[]) {
            if (page.style.height) {
              page.style.minHeight = page.style.height;
              page.style.height = 'auto';
            }
          }
        }
        if (!box.textContent?.trim()) throw new Error('empty');
        fitWidth(box, content ?? null);
        if (!cancelled) setBusy(false);
      } catch {
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [data, onFail]);
  return (
    <>
      {busy && <Spinner />}
      <div ref={boxRef} className="min-h-full bg-[#E8EAED] text-black" />
    </>
  );
}

function HwpxView({ result }: { result: HwpxResult }) {
  return (
    <div className="mx-auto my-2 max-w-3xl bg-white p-4 text-sm leading-relaxed text-black shadow-sm sm:my-4 sm:p-8">
      {result.blocks.length === 0 && <p className="text-muted-foreground">표시할 글자가 없습니다.</p>}
      {result.blocks.map((b, i) =>
        b.t === 'p' ? (
          <p key={i} className="mb-2 whitespace-pre-wrap break-words">
            {b.text}
          </p>
        ) : (
          <div key={i} className="mb-3 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} colSpan={c.colSpan} rowSpan={c.rowSpan} className="whitespace-pre-wrap break-words border border-gray-400 px-2 py-1 align-top">
                        {c.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
      {result.images > 0 && <p className="mt-4 text-xs text-gray-500">그림·개체 {result.images}개는 미리보기에 표시하지 않았습니다([그림] 자리).</p>}
    </div>
  );
}

function ParagraphsView({ paragraphs, note }: { paragraphs: string[]; note?: string }) {
  return (
    <div className="mx-auto my-2 max-w-3xl bg-white p-4 text-sm leading-relaxed text-black shadow-sm sm:my-4 sm:p-8">
      {note && <p className="mb-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">{note}</p>}
      {paragraphs.length === 0 && !note && <p className="text-gray-500">표시할 글자가 없습니다.</p>}
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-2 whitespace-pre-wrap break-words">
          {p}
        </p>
      ))}
    </div>
  );
}

function Spinner({ text = '미리보기를 준비하고 있습니다…' }: { text?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {text}
    </div>
  );
}

type View =
  | { t: 'loading'; text?: string }
  | { t: 'error'; message: string }
  | { t: 'pdf'; data: Uint8Array }
  | { t: 'image'; src: string }
  | { t: 'docx'; data: ArrayBuffer }
  | { t: 'hwp'; data: Uint8Array }
  | { t: 'hwpx'; result: HwpxResult }
  | { t: 'paras'; paragraphs: string[]; note?: string }
  | { t: 'html'; html: string }
  | { t: 'plain'; text: string }
  | { t: 'frame'; src: string }
  | { t: 'none'; ext: string };

/** 미리보기 창 본문 — meta 를 받아 바이트를 읽고 형식별로 그린다 */
function PreviewBody({ meta, viewOnly, onKind }: { meta: PreviewMeta; viewOnly: boolean; onKind: (k: PreviewKind | 'text-fallback') => void }) {
  const [view, setView] = useState<View>({ t: 'loading' });

  /** 서버 글자 추출로 대체 */
  const toText = useCallback(
    async (reason?: string) => {
      if (!meta.textUrl) {
        setView({ t: 'error', message: reason ?? '이 형식은 웹 미리보기를 지원하지 않습니다.' });
        return;
      }
      setView({ t: 'loading', text: '문서 글자를 읽고 있습니다…' });
      try {
        const r = await loadText(meta.textUrl);
        onKind('text-fallback');
        setView({ t: 'paras', paragraphs: r.paragraphs, note: [reason, r.note].filter(Boolean).join(' ') || undefined });
      } catch (e) {
        setView({ t: 'error', message: e instanceof Error ? e.message : '문서 글자를 읽지 못했습니다.' });
      }
    },
    [meta.textUrl, onKind],
  );
  const failRender = useCallback(() => void toText('원본 모양으로 그리지 못해 글자만 보여 줍니다.'), [toText]);
  const failPdf = useCallback((message: string) => setView({ t: 'error', message }), []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const buf = await fetchBytes(meta.url);
        if (cancelled) return;
        const u8 = new Uint8Array(buf);
        const kind = sniffKind(u8, meta.name, meta.mime);
        onKind(kind);
        if (kind === 'pdf') setView({ t: 'pdf', data: u8 });
        else if (kind === 'image') {
          objectUrl = URL.createObjectURL(new Blob([buf], { type: guessImageMime(u8, meta.mime) }));
          setView({ t: 'image', src: objectUrl });
        } else if (kind === 'docx') setView({ t: 'docx', data: buf });
        else if (kind === 'hwp') setView({ t: 'hwp', data: u8 });
        else if (kind === 'hwpx') {
          try {
            const { readHwpx } = await import('@/lib/files/hwpx');
            const result = await readHwpx(buf);
            if (!cancelled) setView({ t: 'hwpx', result });
          } catch {
            if (!cancelled) await toText('한글(HWPX) 문서 구조를 읽지 못해 글자만 보여 줍니다.');
          }
        } else if (kind === 'doc') await toText();
        else if (kind === 'sheet') {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(buf, { type: 'array' });
          const first = wb.SheetNames[0];
          if (!cancelled) setView({ t: 'html', html: first ? XLSX.utils.sheet_to_html(wb.Sheets[first]!, { header: '', footer: '' }) : '' });
        } else if (kind === 'text') setView({ t: 'plain', text: decodeText(buf) });
        else setView({ t: 'none', ext: meta.name.split('.').pop()?.toUpperCase() || '알 수 없음' });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof FetchBlockedError) {
          // 바이트를 읽지 못함(네트워크·저장소 CORS) — 확장자 기준으로 대체 경로를 쓴다
          const guess = previewKind(meta.name, meta.mime);
          if (guess === 'image') return setView({ t: 'image', src: meta.url });
          // 브라우저 PDF 뷰어는 도구 막대에 저장·인쇄가 있어 다운로드 허용 파일만
          if (guess === 'pdf' && !viewOnly) return setView({ t: 'frame', src: meta.url });
          if (guess === 'hwp' || guess === 'hwpx' || guess === 'doc' || guess === 'docx') return void toText();
        }
        setView({ t: 'error', message: e instanceof Error && e.message ? e.message : '미리보기를 만들지 못했습니다.' });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // meta.url 이 바뀔 때(창을 다시 열 때)만 새로 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.url]);

  const block = viewOnly
    ? {
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        onDragStart: (e: React.DragEvent) => e.preventDefault(),
        onCopy: (e: React.ClipboardEvent) => e.preventDefault(),
      }
    : {};
  return (
    <div
      className={cn('relative min-h-0 flex-1 overflow-auto bg-muted/30', viewOnly && 'select-none [-webkit-touch-callout:none] [&_canvas]:pointer-events-none [&_img]:pointer-events-none')}
      {...block}
    >
      {view.t === 'loading' && <Spinner text={view.text} />}
      {view.t === 'error' && (
        <div className="flex h-full min-h-[40dvh] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <p>{view.message}</p>
          {meta.downloadUrl && !viewOnly && <p>원본은 [다운로드]로 확인하세요.</p>}
        </div>
      )}
      {view.t === 'pdf' && <PdfView data={view.data} onError={failPdf} />}
      {view.t === 'frame' && <iframe src={view.src} title={meta.name} className="absolute inset-0 h-full w-full border-0" />}
      {view.t === 'image' && (
        <div className="flex h-full items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.src} alt={meta.name} draggable={false} className="max-h-full max-w-full object-contain" />
        </div>
      )}
      {view.t === 'docx' && <DocxView data={view.data} onFail={failRender} />}
      {view.t === 'hwp' && <HwpView data={view.data} onFail={failRender} />}
      {view.t === 'hwpx' && <HwpxView result={view.result} />}
      {view.t === 'paras' && <ParagraphsView paragraphs={view.paragraphs} note={view.note} />}
      {view.t === 'html' && (
        <div className="overflow-auto bg-white p-3 text-xs text-black [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1" dangerouslySetInnerHTML={{ __html: view.html }} />
      )}
      {view.t === 'plain' && <pre className="whitespace-pre-wrap break-words bg-white p-4 text-sm text-black">{view.text}</pre>}
      {view.t === 'none' && (
        <div className="flex h-full min-h-[40dvh] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <p>이 형식({view.ext})은 웹 미리보기를 지원하지 않습니다.</p>
          <p>미리보기 지원: PDF · 이미지 · 한글 HWP/HWPX · Word DOC/DOCX · 엑셀{meta.downloadUrl && !viewOnly ? ' — [다운로드]로 받아서 열어 주세요.' : ''}</p>
        </div>
      )}
    </div>
  );
}

/** 미리보기 전용 창이 열려 있는 동안: 인쇄 결과 가리기 + Ctrl/⌘+P·S 막기 */
function usePrintBlock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    html.classList.add(PRINT_BLOCK_CLASS);
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's')) {
        e.preventDefault();
        e.stopPropagation();
        toast({ title: '인쇄·저장이 제한된 문서입니다.', description: '이 문서는 화면 미리보기로만 볼 수 있습니다.' });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      html.classList.remove(PRINT_BLOCK_CLASS);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [active]);
}

type MetaState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; meta: PreviewMeta };

/** 미리보기 계약 읽기 + 형식 상태 — 레이어 팝업과 새 창 뷰어 페이지 공용 */
function useViewer(href: string | null, active: boolean, allowDownload: boolean) {
  const [state, setState] = useState<MetaState>({ status: 'loading' });
  const [kind, setKind] = useState<PreviewKind | 'text-fallback' | null>(null);
  useEffect(() => {
    if (!active || !href) return;
    let cancelled = false;
    setState({ status: 'loading' });
    setKind(null);
    loadMeta(href)
      .then((meta) => !cancelled && setState({ status: 'ready', meta }))
      .catch((e: unknown) => !cancelled && setState({ status: 'error', message: e instanceof Error ? e.message : '파일 정보를 불러오지 못했습니다.' }));
    return () => {
      cancelled = true;
    };
  }, [active, href]);
  const meta = state.status === 'ready' ? state.meta : null;
  const downloadHref = meta && allowDownload ? meta.downloadUrl : null;
  // 서버 판정이 오기 전까지는 미리보기 전용으로 취급한다(인쇄 차단이 늦게 걸리지 않도록)
  const viewOnly = !downloadHref;
  usePrintBlock(active && viewOnly);
  const note = kind === 'text-fallback' ? '원본 서식 대신 문서의 글자만 보여 줍니다(표 모양·그림 제외).' : kind ? PREVIEW_NOTES[kind] : undefined;
  return { state, meta, downloadHref, viewOnly, setKind, note };
}

/** 뷰어 머리 오른쪽 — 미리보기 전용 배지 · [새 창](자체 뷰어 페이지) · [다운로드] */
function ViewerActions({ meta, viewOnly, downloadHref, newWindowHref }: { meta: PreviewMeta | null; viewOnly: boolean; downloadHref: string | null; newWindowHref: string | null }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {meta && viewOnly && (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">
          <ShieldAlert className="h-3.5 w-3.5" /> 미리보기 전용(다운로드·인쇄 제한)
        </span>
      )}
      {meta && newWindowHref && (
        <Button asChild variant="outline" size="sm" className="gap-1">
          <a href={newWindowHref} target="_blank" rel="noopener noreferrer" title="플랫폼 뷰어로 새 창에서 크게 보기">
            <ExternalLink className="h-3.5 w-3.5" /> 새 창
          </a>
        </Button>
      )}
      {downloadHref && (
        <Button asChild variant="outline" size="sm" className="gap-1">
          <a href={downloadHref}>
            <Download className="h-3.5 w-3.5" /> 다운로드
          </a>
        </Button>
      )}
    </div>
  );
}

/** 뷰어 본문 — 불러오는 중 / 오류 / 미리보기 + 하단 안내 */
function ViewerContent({ v, active }: { v: ReturnType<typeof useViewer>; active: boolean }) {
  return (
    <>
      {active && v.viewOnly && <style>{PRINT_BLOCK_CSS}</style>}
      {active && v.state.status === 'loading' && (
        <div className="relative min-h-0 flex-1">
          <Spinner />
        </div>
      )}
      {active && v.state.status === 'error' && (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">{v.state.message}</div>
      )}
      {active && v.meta && <PreviewBody meta={v.meta} viewOnly={v.viewOnly} onKind={v.setKind} />}
      {v.note && <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">{v.note}</p>}
    </>
  );
}

/**
 * 업로드 파일 [미리보기] 버튼 — 누르면 레이어 팝업에서 파일을 웹으로 보여 준다.
 * docId(문서 id) 또는 metaUrl(같은 계약의 다른 라우트) 중 하나를 준다. allowDownload=false 면 서버가 허용해도 미리보기 전용.
 * [새 창] = 원본 파일이 아니라 플랫폼 자체 뷰어 페이지(/files/view) — 미리보기 전용 파일도 저장·인쇄 없이 크게 볼 수 있다.
 */
export function FilePreviewButton({
  docId,
  metaUrl,
  name,
  label = '미리보기',
  size = 'sm',
  className,
  allowDownload = true,
}: SourceProps & {
  name: string;
  /** (하위 호환) 형식 판정은 파일 바이트로 한다 */
  mime?: string | null;
  label?: string;
  size?: Size;
  className?: string;
  allowDownload?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const href = metaHref({ docId, metaUrl });
  const v = useViewer(href, open, allowDownload);
  // allowDownload=false 로 연 파일은 새 창에서도 다운로드를 숨기도록 표시를 넘긴다
  const pageHref = viewerPageHref({ docId, metaUrl });
  const newWindowHref = pageHref ? (allowDownload ? pageHref : `${pageHref}&nodl=1`) : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!href}
        className={cn('gap-1', size === 'xs' && 'h-7 px-2 text-xs', className)}
        title={`${name} 미리보기`}
      >
        <Eye className="h-3.5 w-3.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[88dvh] max-w-5xl flex-col gap-0 p-0 sm:h-[88vh]">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b p-3 pr-12">
            <DialogTitle className="min-w-0 truncate text-base">{v.meta?.name ?? name}</DialogTitle>
            <DialogDescription className="sr-only">업로드된 파일 미리보기</DialogDescription>
            <ViewerActions meta={v.meta} viewOnly={v.viewOnly} downloadHref={v.downloadHref} newWindowHref={newWindowHref} />
          </DialogHeader>
          <ViewerContent v={v} active={open} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * 새 창 뷰어 페이지 본문 (/files/view) — 팝업과 같은 엔진·같은 차단 규칙을 화면 전체로.
 * `metaHrefValue` 는 페이지(서버)가 검증한 같은 출처 주소만 받는다.
 */
export function FileViewerPage({ metaHrefValue, allowDownload = true }: { metaHrefValue: string; allowDownload?: boolean }) {
  const v = useViewer(metaHrefValue, true, allowDownload);
  useEffect(() => {
    if (v.meta?.name) document.title = `${v.meta.name} — 미리보기`;
  }, [v.meta?.name]);
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h1 className="min-w-0 truncate text-base font-semibold">{v.meta?.name ?? '파일 미리보기'}</h1>
        <ViewerActions meta={v.meta} viewOnly={v.viewOnly} downloadHref={v.downloadHref} newWindowHref={null} />
      </header>
      <ViewerContent v={v} active />
    </div>
  );
}

/** [다운로드] — 누를 때 계약(meta)을 확인해 허용된 경우에만 내려받는다(차단 파일은 안내만) */
function DownloadButton({ source, name, size }: { source: SourceProps; name: string; size: Size }) {
  const [busy, setBusy] = useState(false);
  const href = metaHref(source);
  const onClick = async () => {
    if (!href) return;
    setBusy(true);
    try {
      const meta = await loadMeta(href);
      if (!meta.downloadUrl) {
        toast({ title: '다운로드가 제한된 문서입니다.', description: '이 문서는 [미리보기]로만 볼 수 있습니다.' });
        return;
      }
      window.location.assign(meta.downloadUrl);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : '다운로드하지 못했습니다.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={busy || !href}
      className={cn('gap-1', size === 'xs' && 'h-7 px-2 text-xs')}
      title={`${name} 다운로드`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} 다운로드
    </Button>
  );
}

/**
 * 파일 한 건의 [미리보기] + [다운로드] 묶음 — 회차 보고서·관찰의견서·서류 목록 공용.
 * allowDownload=false 면 [다운로드] 버튼을 숨기고 미리보기 전용으로 연다. true(기본)여도 서버가 막은 파일은 누를 때 안내만 한다.
 */
export function FileActions({
  docId,
  metaUrl,
  name,
  mime,
  size = 'xs',
  className,
  allowDownload = true,
}: SourceProps & { name: string; mime?: string | null; size?: Size; className?: string; allowDownload?: boolean }) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <FilePreviewButton docId={docId} metaUrl={metaUrl} name={name} mime={mime} size={size} allowDownload={allowDownload} />
      {allowDownload && <DownloadButton source={{ docId, metaUrl }} name={name} size={size} />}
    </span>
  );
}
