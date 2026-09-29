'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Eye, ExternalLink, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { docFileHref, PREVIEW_NOTES, previewKind, type PreviewKind } from '@/lib/files/preview-kind';
import { cn } from '@/lib/utils';

/** 파일 본문을 가져온다 (권한 라우트 → 서명 URL 로 이동 → 파일) */
async function fetchBytes(docId: string): Promise<ArrayBuffer> {
  const res = await fetch(docFileHref(docId, 'inline'), { credentials: 'same-origin' });
  if (!res.ok) throw new Error(res.status === 403 ? '이 파일을 볼 권한이 없습니다.' : '파일을 불러오지 못했습니다.');
  return res.arrayBuffer();
}

/** HWPX(zip + XML) → 문단 텍스트. 표·그림 모양은 빼고 글자만 */
async function hwpxParagraphs(buf: ArrayBuffer): Promise<string[]> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const sections = Object.keys(zip.files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/i)?.[1] ?? 0) - Number(b.match(/(\d+)\.xml$/i)?.[1] ?? 0));
  const out: string[] = [];
  for (const name of sections) {
    const xml = await zip.file(name)!.async('string');
    const docXml = new DOMParser().parseFromString(xml, 'application/xml');
    const paras = Array.from(docXml.getElementsByTagNameNS('*', 'p'));
    for (const p of paras) {
      // 표 안 문단은 표 셀 안의 p 로 다시 나오므로, 바로 아래 run 의 t 만 모은다
      const text = Array.from(p.getElementsByTagNameNS('*', 't'))
        .filter((t) => t.parentElement?.parentElement === p || t.parentElement === p)
        .map((t) => t.textContent ?? '')
        .join('');
      if (text.trim()) out.push(text);
    }
  }
  return out;
}

function PreviewBody({ docId, name, kind }: { docId: string; name: string; kind: PreviewKind }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(kind === 'pdf' || kind === 'image' || kind === 'none' ? 'ready' : 'loading');
  const [error, setError] = useState('');
  const [paras, setParas] = useState<string[]>([]);
  const [html, setHtml] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    if (kind === 'pdf' || kind === 'image' || kind === 'none') return;
    let cancelled = false;
    let destroy: (() => void) | null = null;
    (async () => {
      try {
        const buf = await fetchBytes(docId);
        if (cancelled) return;
        if (kind === 'docx') {
          const { renderAsync } = await import('docx-preview');
          if (boxRef.current) {
            boxRef.current.innerHTML = '';
            await renderAsync(buf, boxRef.current, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true });
          }
        } else if (kind === 'hwp') {
          // hwp.js 는 브라우저 전용 — 필요할 때만 불러온다
          const mod = (await import('hwp.js')) as unknown as { Viewer: new (el: HTMLElement, data: Uint8Array, opt?: { type: 'array' | 'binary' }) => { distory?: () => void } };
          if (boxRef.current) {
            boxRef.current.innerHTML = '';
            const v = new mod.Viewer(boxRef.current, new Uint8Array(buf), { type: 'array' });
            destroy = () => v.distory?.();
          }
        } else if (kind === 'hwpx') {
          setParas(await hwpxParagraphs(buf));
        } else if (kind === 'sheet') {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(buf, { type: 'array' });
          const first = wb.SheetNames[0];
          setHtml(first ? XLSX.utils.sheet_to_html(wb.Sheets[first]!, { header: '', footer: '' }) : '');
        } else if (kind === 'text') {
          setText(new TextDecoder('utf-8').decode(buf));
        }
        if (!cancelled) setState('ready');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error && e.message ? e.message : '미리보기를 만들지 못했습니다.');
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [docId, kind]);

  const inline = docFileHref(docId, 'inline');
  return (
    <div className="relative min-h-0 flex-1 overflow-auto bg-muted/30">
      {state === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 미리보기를 준비하고 있습니다…
        </div>
      )}
      {state === 'error' && (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
          <p className="text-muted-foreground">{error} 원본은 [다운로드]로 확인하세요.</p>
        </div>
      )}
      {kind === 'pdf' && <iframe src={inline} title={name} className="h-full min-h-[60dvh] w-full border-0" />}
      {kind === 'image' && (
        <div className="flex h-full items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={inline} alt={name} className="max-h-full max-w-full object-contain" />
        </div>
      )}
      {(kind === 'docx' || kind === 'hwp') && <div ref={boxRef} className="min-h-[60dvh] overflow-auto bg-white p-2 text-black [&_canvas]:max-w-full" />}
      {kind === 'hwpx' && state === 'ready' && (
        <div className="mx-auto max-w-3xl bg-white p-6 text-sm leading-relaxed text-black shadow-sm">
          {paras.length === 0 ? <p className="text-muted-foreground">표시할 글자가 없습니다.</p> : paras.map((p, i) => <p key={i} className="mb-2 whitespace-pre-wrap">{p}</p>)}
        </div>
      )}
      {kind === 'sheet' && state === 'ready' && (
        <div className="overflow-auto bg-white p-3 text-xs text-black [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_table]:border-collapse" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {kind === 'text' && state === 'ready' && <pre className="whitespace-pre-wrap bg-white p-4 text-sm text-black">{text}</pre>}
      {kind === 'none' && (
        <div className="flex h-full min-h-[40dvh] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <p>이 형식({name.split('.').pop()?.toUpperCase() || '알 수 없음'})은 웹 미리보기를 지원하지 않습니다.</p>
          <p>[다운로드]로 받아서 열어 주세요. (미리보기 지원: PDF · 이미지 · 한글 HWP/HWPX · Word DOCX · 엑셀)</p>
        </div>
      )}
    </div>
  );
}

/**
 * 업로드 파일 [미리보기] 버튼 (2026-09-30) — 누르면 레이어 팝업에서 파일을 웹으로 보여 준다.
 * PDF·이미지 = 브라우저 그대로 / Word(DOCX)·한글(HWP) = 브라우저에서 그려서 / HWPX = 글자만 / 엑셀 = 첫 시트 표.
 * 권한은 `/api/files/doc/{id}` 가 확인한다(서버에서 받는 값은 문서 id·이름뿐 — 직렬화 가능한 문자열).
 */
export function FilePreviewButton({
  docId,
  name,
  mime,
  label = '미리보기',
  size = 'sm',
  className,
}: {
  docId: string;
  name: string;
  mime?: string | null;
  label?: string;
  size?: 'sm' | 'xs';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const kind = previewKind(name, mime);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn('gap-1', size === 'xs' && 'h-7 px-2 text-xs', className)}
        title={`${name} 미리보기`}
      >
        <Eye className="h-3.5 w-3.5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[88dvh] max-w-5xl flex-col gap-0 p-0 sm:h-[88vh]">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 border-b p-3 pr-12">
            <DialogTitle className="min-w-0 truncate text-base">{name}</DialogTitle>
            <DialogDescription className="sr-only">업로드된 파일 미리보기</DialogDescription>
            <div className="flex shrink-0 items-center gap-1.5">
              {(kind === 'pdf' || kind === 'image') && (
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <a href={docFileHref(docId, 'inline')} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> 새 창
                  </a>
                </Button>
              )}
              <Button asChild variant="outline" size="sm" className="gap-1">
                <a href={docFileHref(docId, 'download')}>
                  <Download className="h-3.5 w-3.5" /> 다운로드
                </a>
              </Button>
            </div>
          </DialogHeader>
          {open && <PreviewBody docId={docId} name={name} kind={kind} />}
          {PREVIEW_NOTES[kind] && <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">{PREVIEW_NOTES[kind]}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 파일 한 건의 [미리보기] + [다운로드] 묶음 — 회차 보고서·관찰의견서·서류 목록 공용 */
export function FileActions({ docId, name, mime, size = 'xs', className }: { docId: string; name: string; mime?: string | null; size?: 'sm' | 'xs'; className?: string }) {
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <FilePreviewButton docId={docId} name={name} mime={mime} size={size} />
      <Button asChild variant="outline" size="sm" className={cn('gap-1', size === 'xs' && 'h-7 px-2 text-xs')} title={`${name} 다운로드`}>
        <a href={docFileHref(docId, 'download')}>
          <Download className="h-3.5 w-3.5" /> 다운로드
        </a>
      </Button>
    </span>
  );
}
