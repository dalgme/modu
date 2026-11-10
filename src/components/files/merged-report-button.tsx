'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileStack, Loader2, RefreshCw } from 'lucide-react';

import { mergePartsToPdf, mergeFailureText } from '@/lib/files/round-package-build';
import type { MergedReportPlan } from '@/lib/files/merged-report-shared';
import { roundsText } from '@/lib/files/merged-report-shared';
import { saveMergedReportAction } from '@/lib/files/merged-report-actions';
import { stageUpload } from '@/lib/storage/browser-upload';
import { FileActions } from '@/components/files/file-preview';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * 멘티별 회차 보고서 합본 PDF (2026-11-10) — 회차 순서대로 한 PDF 로 합쳐 따로 저장하고, 저장본을 [미리보기]·[다운로드]로 받는다.
 * 합치기는 이 브라우저에서 한다(한글 HWP·HWPX 는 rhwp 로 쪽 이미지 변환). 서버는 목록·검증·저장만.
 * 보고서가 새로 올라오거나 바뀌면 저장본은 '다시 만들기 필요'로 표시된다(지문 비교 — merged-report-shared.ts).
 */
export interface MergedStatusProps {
  docId: string | null;
  name: string | null;
  stale: boolean;
  includedRounds: number[];
  missingRounds: number[];
  reportRounds: number[];
}

type BuildOutcome = { ok: true; message: string; problems: string[] } | { ok: false; error: string; problems: string[] };

/** 케이스 1건: 목록 → PDF 합치기 → 스테이징 업로드 → 저장 */
export async function buildAndSaveMergedReport(caseId: string, onStep?: (text: string) => void): Promise<BuildOutcome> {
  onStep?.('목록 준비 중…');
  const res = await fetch(`/api/files/merged-report?case=${caseId}`, { credentials: 'same-origin' });
  const body = (await res.json().catch(() => ({}))) as Partial<MergedReportPlan> & { error?: string };
  if (!res.ok || !body.parts) return { ok: false, error: body.error ?? '목록을 불러오지 못했습니다.', problems: [] };
  const plan = body as MergedReportPlan;
  onStep?.(`PDF 합치는 중 (${plan.parts.length}개 회차)…`);
  const r = await mergePartsToPdf(
    plan.parts,
    async (url) => {
      const f = await fetch(url);
      if (!f.ok) throw new Error(String(f.status));
      return new Uint8Array(await f.arrayBuffer());
    },
    async (bytes) => (await import('@/lib/files/hwp-render')).renderHwpPages(bytes),
  );
  const problems = r.failed.map((f) => `${plan.menteeName} · ${f.part.label}(${f.part.sourceName}): ${mergeFailureText(f.part, f.reason)} 합본에서 빠짐`);
  if (!r.pdf) return { ok: false, error: `${plan.menteeName}: PDF 로 합칠 수 있는 보고서가 없습니다.`, problems };
  onStep?.('저장 중…');
  const staged = await stageUpload(new File([r.pdf as Uint8Array<ArrayBuffer>], `${plan.caseId}.pdf`, { type: 'application/pdf' }));
  const saved = await saveMergedReportAction({
    caseId: plan.caseId,
    stagingPath: staged.stagingPath,
    fingerprint: plan.fingerprint,
    includedRounds: r.merged.map((i) => plan.parts[i]!.roundNo),
  });
  return saved.ok ? { ok: true, message: saved.message, problems } : { ok: false, error: saved.error, problems };
}

function ProblemsDialog({ problems, onClose }: { problems: string[] | null; onClose: () => void }) {
  return (
    <Dialog open={!!problems && problems.length > 0} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>확인이 필요한 보고서가 있습니다</DialogTitle>
          <DialogDescription>
            암호·배포용으로 저장된 한글 파일, Word 파일, 손상된 PDF 는 자동으로 합칠 수 없습니다. 한글·Word 에서 PDF 로 저장해 [보고서 수정 업로드]로 바꿔 올린 뒤 합본을 다시 만들어 주세요.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] list-disc space-y-0.5 overflow-auto pl-5 text-xs">
          {(problems ?? []).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" onClick={onClose}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 멘티 1명 — 저장본 받기 + 만들기/다시 만들기 */
export function MergedReportButton({ caseId, status, canBuild = true, compact = false }: { caseId: string; status: MergedStatusProps; canBuild?: boolean; compact?: boolean }) {
  const { toast } = useToast();
  const router = useRouter();
  const [step, setStep] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[] | null>(null);
  const busy = step !== null;
  const hasReports = status.reportRounds.length > 0;

  const run = async () => {
    setStep('준비 중…');
    try {
      const r = await buildAndSaveMergedReport(caseId, setStep);
      toast(r.ok ? { title: r.message } : { title: r.error, variant: 'destructive' });
      if (r.problems.length) setProblems(r.problems);
      if (r.ok) router.refresh();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : '합본을 만들지 못했습니다.', variant: 'destructive' });
    } finally {
      setStep(null);
    }
  };

  if (!hasReports && !status.docId) return <span className="text-xs text-muted-foreground">보고서 없음</span>;

  const buildLabel = status.docId ? '다시 만들기' : '합본 PDF 만들기';
  return (
    <div className={cn('flex flex-col gap-1 text-xs', compact ? 'items-end' : 'items-start')}>
      {status.docId && status.name && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', status.stale ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200')}>
            {status.stale ? '이전 합본' : `합본 ${roundsText(status.includedRounds)}`}
          </span>
          <FileActions docId={status.docId} name={status.name} />
        </div>
      )}
      {status.stale && <span className="text-[11px] text-amber-800 dark:text-amber-300">보고서가 새로 올라오거나 바뀌었습니다 — 다시 만들어 주세요.</span>}
      {!status.stale && status.missingRounds.length > 0 && <span className="text-[11px] text-amber-800 dark:text-amber-300">{roundsText(status.missingRounds)} 보고서는 PDF 로 바꾸지 못해 빠져 있습니다.</span>}
      {canBuild && hasReports && (!status.docId || status.stale || status.missingRounds.length > 0 || !compact) && (
        <Button type="button" size="sm" variant={status.docId && !status.stale ? 'ghost' : 'outline'} onClick={run} disabled={busy} className="h-7 gap-1 px-2 text-xs">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status.docId ? <RefreshCw className="h-3.5 w-3.5" /> : <FileStack className="h-3.5 w-3.5" />}
          {busy ? step : buildLabel}
        </Button>
      )}
      <ProblemsDialog problems={problems} onClose={() => setProblems(null)} />
    </div>
  );
}

/** 라운드 일괄 — 합본이 없거나 다시 만들어야 하는 멘티를 차례로 만든다 */
export function MergedReportBulkButton({ caseIds, label }: { caseIds: string[]; label: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problems, setProblems] = useState<string[] | null>(null);

  if (caseIds.length === 0) return <span className="text-xs text-muted-foreground">합본 모두 최신</span>;

  const run = async () => {
    setProgress({ done: 0, total: caseIds.length });
    const all: string[] = [];
    let ok = 0;
    for (let i = 0; i < caseIds.length; i++) {
      const id = caseIds[i]!;
      try {
        const r = await buildAndSaveMergedReport(id);
        all.push(...r.problems);
        if (r.ok) ok += 1;
        else all.push(r.error);
      } catch (e) {
        all.push(e instanceof Error ? e.message : '합본을 만들지 못했습니다.');
      }
      setProgress({ done: i + 1, total: caseIds.length });
    }
    setProgress(null);
    toast({ title: `합본 PDF ${ok}/${caseIds.length}건 저장했습니다.` });
    if (all.length) setProblems(all);
    router.refresh();
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={run} disabled={!!progress} className="h-7 gap-1 px-2 text-xs">
        {progress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileStack className="h-3.5 w-3.5" />}
        {progress ? `합본 만드는 중 ${progress.done}/${progress.total}` : `${label} (${caseIds.length}명)`}
      </Button>
      <ProblemsDialog problems={problems} onClose={() => setProblems(null)} />
    </>
  );
}
