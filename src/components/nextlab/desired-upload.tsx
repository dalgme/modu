'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, Upload } from 'lucide-react';

import { uploadMentorDesiredAction, type DesiredUploadResult } from '@/lib/import/desired-actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

/**
 * 멘토 희망 멘티 수 엑셀 업로드 버튼 + 팝업 (2026-10-23) — 매칭 리스트 툴바.
 * 라운드별로 "멘토명·전화번호·이메일·희망 멘티 수" 파일을 올리면 수동 검색 팝업의 [희망멘티 수] 칸이 채워진다.
 */
export function DesiredUploadButton({ groups, defaultGroupId }: { groups: { id: string; name: string }[]; defaultGroupId: string | null }) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [groupId, setGroupId] = useState(defaultGroupId ?? '');
  const [result, setResult] = useState<DesiredUploadResult | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('group', groupId);
    setBusy(true);
    try {
      const r = await uploadMentorDesiredAction(fd);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setResult(r);
      toast({ title: `${r.groupName} 희망 멘티 수 ${r.updated}명 반영${r.cleared ? ` · 해제 ${r.cleared}명` : ''}` });
      router.refresh();
    } catch (err) {
      toast({ title: `업로드 실패: ${err instanceof Error ? err.message : String(err)}`, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-9 gap-1 bg-background" onClick={() => { setResult(null); setGroupId(defaultGroupId ?? ''); setOpen(true); }} title="라운드별 멘토 희망 멘티 수 엑셀을 올립니다">
        <UserCheck className="h-4 w-4" /> 멘토 희망 멘티 수 업로드
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>멘토 희망 멘티 수 업로드</DialogTitle>
            <DialogDescription>
              라운드마다 &ldquo;멘토명, 전화번호, 이메일, 희망 멘티 수&rdquo; 엑셀(xlsx)을 올리면 매칭 [수동 검색] 팝업의 <b>희망멘티 수</b> 칸에 표시됩니다.
              멘토명으로 찾고, 같은 이름이 여럿이면 등록된 전화번호로 구분합니다. 파일에 없는 멘토의 값은 그대로 둡니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <a href="/api/nextlab/desired-template" className="text-xs text-primary underline underline-offset-2">템플릿 다운로드 (멘토명 · 전화번호 · 이메일 · 희망 멘티 수)</a>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">라운드(사업그룹) <b className="text-destructive">*</b></span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} required className="h-9 rounded-md border bg-background px-2 text-sm" disabled={busy}>
                <option value="">라운드 선택</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <input type="file" name="file" accept=".xlsx,.xls" required className="text-sm" disabled={busy} />
            {result && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                <p className="font-semibold">{result.groupName} — 반영 {result.updated}명{result.cleared ? ` · 해제 ${result.cleared}명` : ''}</p>
                {result.notFound.length > 0 && <p className="mt-1 text-destructive">찾지 못함 {result.notFound.length}: {result.notFound.join(', ')}</p>}
                {result.ambiguous.length > 0 && <p className="mt-1 text-amber-700">동명이인 구분 불가 {result.ambiguous.length}: {result.ambiguous.join(', ')}</p>}
                {result.invalid.length > 0 && <p className="mt-1 text-amber-700">값 오류 {result.invalid.length}: {result.invalid.join(', ')}</p>}
                {result.duplicate.length > 0 && <p className="mt-1 text-muted-foreground">중복 행(마지막 값 적용) {result.duplicate.length}: {result.duplicate.join(', ')}</p>}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>닫기</Button>
              <Button type="submit" disabled={busy || !groupId}><Upload className="mr-1 h-4 w-4" />{busy ? '업로드 중…' : '업로드'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
