'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Undo2, X } from 'lucide-react';

import type { FracRect } from '@/lib/files/observation-redact';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * 관찰의견서 직접 가리기 (2026-11-18) — 자동으로 칸을 못 찾은 파일(스캔·그림 PDF 등)을 사람이 상자를 그려 가린다.
 * 쪽 그림 위를 끌어서 검은 상자를 그리고 [가리기 적용] → 상자가 있는 쪽만 그림으로 바꿔 검게 칠한 PDF 를 돌려준다.
 * 저장된 원본은 그대로 — 이 브라우저가 만든 사본만 바뀐다.
 */
export function ManualBlindDialog({ name, pdf, onClose, onApply }: { name: string; pdf: Uint8Array | null; onClose: () => void; onApply: (pdf: Uint8Array) => Promise<void> | void }) {
  const [pages, setPages] = useState<{ url: string; ratio: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rects, setRects] = useState<FracRect[]>([]);
  const [draft, setDraft] = useState<FracRect | null>(null);
  const [saving, setSaving] = useState(false);
  const start = useRef<{ page: number; x: number; y: number; el: HTMLElement } | null>(null);

  useEffect(() => {
    setPages(null);
    setRects([]);
    setError(null);
    if (!pdf) return;
    let alive = true;
    import('@/lib/files/observation-redact')
      .then((m) => m.renderPdfPreview(pdf))
      .then((p) => alive && setPages(p))
      .catch(() => alive && setError('PDF 를 그리지 못했습니다.'));
    return () => {
      alive = false;
    };
  }, [pdf]);

  const pos = (e: React.PointerEvent, el: HTMLElement) => {
    const b = el.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  };
  const down = (page: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const p = pos(e, el);
    start.current = { page, ...p, el };
    setDraft({ page, x: p.x, y: p.y, w: 0, h: 0 });
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const p = pos(e, s.el);
    setDraft({ page: s.page, x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const up = () => {
    const d = draft;
    start.current = null;
    setDraft(null);
    if (d && d.w > 0.005 && d.h > 0.003) setRects((r) => [...r, d]);
  };

  const apply = async () => {
    if (!pdf || rects.length === 0) return;
    setSaving(true);
    try {
      const m = await import('@/lib/files/observation-redact');
      await onApply(await m.applyManualBoxes(pdf, rects));
    } catch {
      setError('가린 PDF 를 만들지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const box = (r: FracRect, i: number | null) => (
    <div key={i ?? 'draft'} className="absolute bg-black/85 ring-1 ring-red-500" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
      {i !== null && (
        <button
          type="button"
          onClick={() => setRects((all) => all.filter((_, k) => k !== i))}
          className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow"
          aria-label="이 상자 지우기"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );

  return (
    <Dialog open={!!pdf} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>직접 가리기 — {name}</DialogTitle>
          <DialogDescription>
            “운영기관”·“책임멘토명” 오른쪽 칸(이름에 걸친 도장 포함)을 마우스나 손가락으로 끌어 검은 상자를 그리세요. 상자 오른쪽 위 ✕ 로 지울 수 있습니다. [가리기 적용]을 누르면 상자가 있는 쪽은 그림으로 바뀌어 글자를 복사할 수 없습니다(저장된 원본은 그대로).
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-auto rounded-md border bg-muted/40 p-2">
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!pages && !error && (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> 쪽을 그리는 중…
            </p>
          )}
          {pages?.map((pg, i) => (
            <div key={i} className="mx-auto mb-3 max-w-[860px]">
              <p className="mb-1 text-xs text-muted-foreground">{i + 1}쪽</p>
              <div
                className="relative w-full cursor-crosshair select-none bg-white shadow"
                style={{ paddingTop: `${pg.ratio * 100}%`, touchAction: 'none' }}
                onPointerDown={down(i)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pg.url} alt={`${i + 1}쪽`} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
                {rects.map((r, k) => (r.page === i ? box(r, k) : null))}
                {draft && draft.page === i && box(draft, null)}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">그린 상자 {rects.length}개</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRects((r) => r.slice(0, -1))} disabled={rects.length === 0 || saving} className="gap-1">
              <Undo2 className="h-4 w-4" /> 마지막 상자 지우기
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
              닫기
            </Button>
            <Button type="button" size="sm" onClick={apply} disabled={rects.length === 0 || saving} className="gap-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} 가리기 적용
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
