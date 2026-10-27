'use client';

import { useState } from 'react';
import { Loader2, PackageOpen } from 'lucide-react';

import { assembleRoundPackage, type BuildProgress } from '@/lib/files/round-package-build';
import type { RoundPackageManifest } from '@/lib/files/round-package-shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * 라운드 제출용 묶음 받기 (2026-10-27) — 멘토별(지급서류+보고서, 20명씩 ZIP 안의 ZIP) / 멘티별(번호 폴더).
 * 서버에서 목록만 받고, 이 브라우저가 파일을 받아 PDF 로 합치고(한글은 rhwp 로 변환) ZIP 으로 묶는다. 끝나면 합치지 못한 파일 목록을 보여 준다.
 */
export function RoundPackageButton({ kind, groupId, label }: { kind: 'mentor' | 'mentee'; groupId: string; label: string }) {
  const { toast } = useToast();
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [report, setReport] = useState<{ title: string; pdfCount: number; problems: string[]; notes: string[] } | null>(null);
  const busy = progress !== null;

  const run = async () => {
    setProgress({ done: 0, total: 0, phase: 'files' });
    try {
      const res = await fetch(`/api/files/round-package?kind=${kind}&group=${groupId}`, { credentials: 'same-origin' });
      const body = (await res.json().catch(() => ({}))) as Partial<RoundPackageManifest> & { error?: string };
      if (!res.ok || !body.folders) {
        toast({ title: body.error ?? '목록을 불러오지 못했습니다.', variant: 'destructive' });
        return;
      }
      const manifest = body as RoundPackageManifest;
      const r = await assembleRoundPackage(
        manifest,
        async (url) => {
          const f = await fetch(url);
          if (!f.ok) throw new Error(String(f.status));
          return new Uint8Array(await f.arrayBuffer());
        },
        setProgress,
        {
          // 한글(HWP·HWPX)은 rhwp 로 쪽 이미지를 만들어 합친다 — 변환기(WASM)는 필요할 때만 받는다
          renderHwp: async (bytes) => (await import('@/lib/files/hwp-render')).renderHwpPages(bytes),
        },
      );
      const blob = await r.zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = manifest.zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      setReport({ title: `${manifest.groupName} · ${manifest.zipName}`, pdfCount: r.pdfCount, problems: r.problems, notes: manifest.notes });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : '묶음을 만들지 못했습니다.', variant: 'destructive' });
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={run} disabled={busy} className="h-7 gap-1 px-2 text-xs">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageOpen className="h-3.5 w-3.5" />}
        {busy ? (progress.phase === 'zip' ? '압축 중…' : progress.total ? `PDF 합치는 중 ${progress.done}/${progress.total}` : '목록 준비 중…') : label}
      </Button>
      <Dialog open={!!report} onOpenChange={(o) => !o && setReport(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>저장했습니다</DialogTitle>
            <DialogDescription>{report?.title} — PDF {report?.pdfCount ?? 0}개</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-auto text-sm">
            {report && report.problems.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="font-semibold text-amber-900 dark:text-amber-100">PDF 로 합치지 못한 파일 {report.problems.length}개 — 원본을 같은 폴더에 함께 넣었습니다</p>
                <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-100/80">암호·배포용으로 저장된 한글 파일, Word 파일, 손상된 PDF 는 자동으로 합칠 수 없습니다. 한글에서 PDF 로 저장해 바꿔 넣거나, 멘토에게 PDF 로 다시 올려 달라고 요청하세요.</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                  {report.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {report && report.notes.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {report.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {report && report.problems.length === 0 && <p className="text-xs text-muted-foreground">모든 파일을 PDF 로 합쳤습니다.</p>}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setReport(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
