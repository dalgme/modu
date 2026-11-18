'use client';

import { useState } from 'react';
import { EyeOff, Loader2 } from 'lucide-react';

import { assembleObservationBundle, originalProcessors } from '@/lib/files/observation-bundle-build';
import type { BlindStatus, ObservationBundleManifest } from '@/lib/files/observation-redact-shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * 라운드 관찰의견서 묶음 받기 (2026-11-17, 11-18 원본 추가) — 멘토별/멘티별 번호 순서로 한 폴더 ZIP.
 *  - original: PDF 그대로(한글은 이 브라우저에서 PDF 로만 바꿈)
 *  - blind: 사본의 "운영기관"·"책임멘토명" 오른쪽 칸(+칸에 걸친 도장)을 검게 가린 PDF(저장된 원본은 그대로)
 */
export function ObservationBundleButton({ order, mode, groupId, label }: { order: 'mentor' | 'mentee'; mode: 'original' | 'blind'; groupId: string; label: string }) {
  const { toast } = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ title: string; blind: boolean; counts: Record<BlindStatus, number>; problems: { name: string; reason: string }[]; notes: string[] } | null>(null);
  const busy = progress !== null;

  const run = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      const res = await fetch(`/api/files/observation-bundle?order=${order}&mode=${mode}&group=${groupId}`, { credentials: 'same-origin' });
      const body = (await res.json().catch(() => ({}))) as Partial<ObservationBundleManifest> & { error?: string };
      if (!res.ok || !body.items) {
        toast({ title: body.error ?? '목록을 불러오지 못했습니다.', variant: 'destructive' });
        return;
      }
      const manifest = body as ObservationBundleManifest;
      const redact = await import('@/lib/files/observation-redact');
      const r = await assembleObservationBundle(
        manifest,
        async (url) => {
          const f = await fetch(url);
          if (!f.ok) throw new Error(String(f.status));
          return new Uint8Array(await f.arrayBuffer());
        },
        mode === 'blind' ? { pdf: redact.redactPdf, hwp: redact.redactHwp } : originalProcessors(redact.hwpToPdf),
        (done, total) => setProgress({ done, total }),
      );
      const blob = await r.zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${manifest.base}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      setReport({ title: `${manifest.base}.zip`, blind: mode === 'blind', counts: r.counts, problems: r.problems, notes: manifest.notes });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : '묶음을 만들지 못했습니다.', variant: 'destructive' });
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={run} disabled={busy} className="h-7 gap-1 px-2 text-xs">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
        {busy ? (progress.total ? `${mode === 'blind' ? '가리는 중' : 'PDF 준비 중'} ${progress.done}/${progress.total}` : '목록 준비 중…') : label}
      </Button>
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>저장했습니다</DialogTitle>
            <DialogDescription>
              {report?.blind ? (
                <>
                  {report.title} — 가림 완료 {report.counts.full}개
                  {report.counts.partial > 0 ? ` · 일부 확인 필요 ${report.counts.partial}개` : ''}
                  {report.counts.none > 0 ? ` · 미적용 ${report.counts.none}개` : ''}
                </>
              ) : (
                <>
                  {report?.title} — PDF {report?.counts.full ?? 0}개{report && report.counts.none > 0 ? ` · PDF 로 바꾸지 못한 파일 ${report.counts.none}개` : ''}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-auto text-sm">
            {report && report.problems.length > 0 && (
              <div className="rounded-lg border border-red-300 bg-red-50/70 p-3 dark:border-red-800 dark:bg-red-950/30">
                <p className="font-semibold text-red-900 dark:text-red-100">직접 확인이 필요한 파일 {report.problems.length}개 — 파일 이름 끝에 표시했습니다</p>
                <p className="mt-0.5 text-xs text-red-900/80 dark:text-red-100/80">
                  {report.blind ? '제출 전에 이 파일들을 열어 “운영기관”·“책임멘토명” 칸을 직접 가리거나, 멘토에게 PDF 로 다시 받아 주세요.' : '이 파일들은 원본 형식 그대로 넣었습니다. 한글에서 PDF 로 저장해 바꿔 넣거나 멘토에게 PDF 로 다시 받아 주세요.'}
                </p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                  {report.problems.map((p) => (
                    <li key={p.name}>
                      <b>{p.name}</b> — {p.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report && report.problems.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {report.blind ? '모든 관찰의견서의 “운영기관”·“책임멘토명” 칸을 가렸습니다. 제출 전에 몇 개를 열어 가림 위치를 확인해 주세요.' : '모든 관찰의견서를 PDF 로 넣었습니다(원본 그대로, 가림 없음).'}
              </p>
            )}
            {report && report.notes.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setReport(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
