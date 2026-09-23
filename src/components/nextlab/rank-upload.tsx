'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListOrdered, Upload } from 'lucide-react';

import { uploadMenteeRankAction, type RankUploadResult } from '@/lib/import/rank-actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/** 멘티 순위 엑셀 업로드 버튼 + 팝업 (P27-01) — 멘티 명단·멘티 매칭 리스트 툴바 */
export function RankUploadButton() {
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RankUploadResult | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await uploadMenteeRankAction(fd);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setResult(r);
      toast({ title: `멘티 순위 ${r.updated}명 갱신` });
      router.refresh();
    } catch (err) {
      toast({ title: `업로드 실패: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-9 gap-1 bg-background" onClick={() => { setResult(null); setOpen(true); }} title="멘티명·순위 엑셀을 올려 멘티 순위를 갱신합니다">
        <ListOrdered className="h-4 w-4" /> 멘티 순위 업로드
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>멘티 순위 업로드</DialogTitle>
            <DialogDescription>
              &ldquo;멘티명, 멘티 순위&rdquo; 두 컬럼이 있는 엑셀(xlsx)을 올리면 멘티 명단·매칭 리스트의 순위가 갱신됩니다. 이름으로 찾으며, 동명이인은 고유번호 컬럼으로 구분합니다. 현재 범위(행사 전체/그룹)의 멘티만 대상입니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <a href="/api/nextlab/rank-template" className="text-xs text-primary underline underline-offset-2">템플릿 다운로드 (멘티명 · 멘티 순위 · 고유번호)</a>
            <input ref={fileRef} type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
            {result && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                <p className="font-semibold">갱신 {result.updated}명</p>
                {result.notFound.length > 0 && <p className="mt-1 text-destructive">찾지 못함 {result.notFound.length}: {result.notFound.join(', ')}</p>}
                {result.ambiguous.length > 0 && <p className="mt-1 text-amber-700">동명이인 {result.ambiguous.length}: {result.ambiguous.join(', ')}</p>}
                {result.invalid.length > 0 && <p className="mt-1 text-amber-700">순위 형식 오류 {result.invalid.length}: {result.invalid.join(', ')}</p>}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>닫기</Button>
              <Button type="submit" disabled={busy}><Upload className="mr-1 h-4 w-4" />{busy ? '업로드 중…' : '업로드'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
