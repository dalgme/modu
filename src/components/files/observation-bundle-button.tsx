'use client';

import { useState } from 'react';
import type JSZipType from 'jszip';
import { Download, EyeOff, Loader2, PenLine } from 'lucide-react';

import { assembleObservationBundle, originalProcessors, type ObservationProblem } from '@/lib/files/observation-bundle-build';
import { BLIND_CHECK_LIST_NAME, BLIND_STATUS_LABEL, blindCheckListText, type BlindStatus, type ObservationBundleManifest } from '@/lib/files/observation-redact-shared';
import { ManualBlindDialog } from '@/components/files/manual-blind-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * 라운드 관찰의견서 묶음 받기 (2026-11-17, 11-18 원본 추가) — 멘토별/멘티별 번호 순서로 한 폴더 ZIP.
 *  - original: PDF 그대로(한글은 이 브라우저에서 PDF 로만 바꿈)
 *  - blind: 사본의 "운영기관"·"책임멘토명" 오른쪽 칸(+칸에 걸친 도장)을 검게 가린 PDF(저장된 원본은 그대로)
 *           글자 층이 없는 스캔 PDF 는 글자 인식(OCR)으로 다시 찾고, 그래도 못 가린 파일은 결과 창에서 [직접 가리기] →
 *           고친 파일을 넣어 [고친 묶음 다시 받기](2026-11-18)
 */
type Problem = ObservationProblem & { fixed?: boolean };

function save(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export function ObservationBundleButton({ order, mode, groupId, label }: { order: 'mentor' | 'mentee'; mode: 'original' | 'blind'; groupId: string; label: string }) {
  const { toast } = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ title: string; base: string; blind: boolean; zip: JSZipType; counts: Record<BlindStatus, number>; problems: Problem[]; notes: string[] } | null>(null);
  const [editing, setEditing] = useState<Problem | null>(null);
  const [rezipping, setRezipping] = useState(false);
  const busy = progress !== null;

  /** 직접 가린 PDF 를 ZIP 안의 같은 번호 파일과 바꾼다 */
  const applyFix = async (p: Problem, pdf: Uint8Array) => {
    if (!report || !p.fix) return;
    // 원본과 같은 번호·이름 그대로 — 같은 이름의 파일을 직접 가린 PDF 로 바꾼다
    report.zip.remove(`${report.base}/${p.name}`);
    report.zip.folder(report.base)!.file(p.fix.fixedName, pdf);
    const prev: BlindStatus = p.status === 'partial' ? 'partial' : 'none';
    const problems = report.problems.map((x) => (x === p ? { ...x, name: p.fix!.fixedName, fixed: true, fix: { ...p.fix!, pdf } } : x));
    report.zip.file(BLIND_CHECK_LIST_NAME, blindCheckListText(report.base, problems));
    setReport({
      ...report,
      counts: p.fixed ? report.counts : { ...report.counts, [prev]: report.counts[prev] - 1, full: report.counts.full + 1 },
      problems,
    });
    setEditing(null);
    toast({ title: '가렸습니다. [고친 묶음 다시 받기]로 새 ZIP 을 받으세요.' });
  };
  const rezip = async () => {
    if (!report) return;
    setRezipping(true);
    try {
      save(await report.zip.generateAsync({ type: 'blob', compression: 'STORE' }), report.title);
    } finally {
      setRezipping(false);
    }
  };
  const fixedCount = report?.problems.filter((p) => p.fixed).length ?? 0;

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
      save(await r.zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${manifest.base}.zip`);
      setReport({ title: `${manifest.base}.zip`, base: manifest.base, blind: mode === 'blind', zip: r.zip, counts: r.counts, problems: r.problems, notes: manifest.notes });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : '묶음을 만들지 못했습니다.', variant: 'destructive' });
    } finally {
      setProgress(null);
      void import('@/lib/files/ocr').then((m) => m.closeOcr()).catch(() => undefined);
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
                <p className="font-semibold text-red-900 dark:text-red-100">
                  직접 확인이 필요한 파일 {report.problems.length - fixedCount}개{fixedCount > 0 ? ` · 직접 가림 ${fixedCount}개` : ''}
                  {report.blind ? ` — 파일 이름은 원본과 같은 번호·이름 그대로이고, 이 목록은 ZIP 안 「${BLIND_CHECK_LIST_NAME}」에도 들어 있습니다` : ' — 파일 이름 끝에 표시했습니다'}
                </p>
                <p className="mt-0.5 text-xs text-red-900/80 dark:text-red-100/80">
                  {report.blind
                    ? '[직접 가리기]로 쪽 그림 위에 검은 상자를 그려 가린 뒤 [고친 묶음 다시 받기]를 누르세요. 멘토에게 한글·워드에서 “PDF로 저장”한 파일을 다시 받아도 됩니다(스캔본은 글자 인식이 틀릴 수 있음).'
                    : '이 파일들은 원본 형식 그대로 넣었습니다. 한글에서 PDF 로 저장해 바꿔 넣거나 멘토에게 PDF 로 다시 받아 주세요.'}
                </p>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {report.problems.map((p) => (
                    <li key={p.fix?.fixedName ?? p.name} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 flex-1">
                        {report.blind && !p.fixed && p.status && (
                          <span className={`mr-1 rounded px-1 py-0.5 text-[10px] font-semibold ${p.status === 'partial' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`}>{BLIND_STATUS_LABEL[p.status]}</span>
                        )}
                        <b className={p.fixed ? 'text-emerald-800 dark:text-emerald-300' : undefined}>{p.name}</b> — {p.fixed ? '직접 가림 완료' : p.reason}
                      </span>
                      {p.fix && (
                        <span className="flex gap-1">
                          <Button type="button" size="sm" variant={p.fixed ? 'outline' : 'default'} className="h-7 gap-1 px-2 text-xs" onClick={() => setEditing(p)}>
                            <PenLine className="h-3.5 w-3.5" /> {p.fixed ? '다시 가리기' : '직접 가리기'}
                          </Button>
                          {p.fixed && (
                            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => save(new Blob([p.fix!.pdf.slice()], { type: 'application/pdf' }), p.name)}>
                              <Download className="h-3.5 w-3.5" /> 이 파일만
                            </Button>
                          )}
                        </span>
                      )}
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
          <DialogFooter className="gap-2">
            {fixedCount > 0 && (
              <Button type="button" variant="outline" onClick={rezip} disabled={rezipping} className="gap-1">
                {rezipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} 고친 묶음 다시 받기
              </Button>
            )}
            <Button type="button" onClick={() => setReport(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ManualBlindDialog
        name={editing?.fix?.fixedName ?? ''}
        pdf={editing?.fix?.pdf ?? null}
        onClose={() => setEditing(null)}
        onApply={(pdf) => (editing ? applyFix(editing, pdf) : undefined)}
      />
    </>
  );
}
