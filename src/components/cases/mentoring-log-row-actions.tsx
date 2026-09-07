'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2 } from 'lucide-react';

import { deleteMentoringLogAction } from '@/lib/workflow/log-actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

/** 작성된 멘토링 일지 1건의 수정/삭제 버튼 (담당 멘토용). 삭제는 로그인 비밀번호 확인 후 진행. */
export function MentoringLogRowActions({ caseId, logId }: { caseId: string; logId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onConfirmDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      toast({ title: '비밀번호를 입력하세요.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const res = await deleteMentoringLogAction(caseId, logId, password);
    setBusy(false);
    if (res.ok) {
      toast({ title: '멘토링 일지를 삭제했습니다.' });
      setOpen(false);
      setPassword('');
      router.refresh();
    } else {
      toast({ title: '삭제 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2">
        <Link href={`/mentor/cases/${caseId}/log/${logId}/edit`}>
          <Pencil className="h-3.5 w-3.5" />
          수정
        </Link>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-status-rejected hover:bg-status-rejected/10"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        삭제
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPassword('');
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>멘토링 일지 삭제</DialogTitle>
            <DialogDescription>
              삭제하면 되돌릴 수 없습니다. 본인 확인을 위해 <b>로그인 비밀번호</b>를 입력한 뒤
              삭제해 주세요.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onConfirmDelete} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`del-pw-${logId}`}>로그인 비밀번호</Label>
              <Input
                id={`del-pw-${logId}`}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={busy || !password}
                className="bg-status-rejected text-white hover:bg-status-rejected/90"
              >
                {busy ? '삭제 중…' : '삭제'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
