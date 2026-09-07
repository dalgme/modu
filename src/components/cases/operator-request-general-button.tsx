'use client';

import { useState } from 'react';
import { Megaphone } from 'lucide-react';

import { createOperatorRequestAction } from '@/lib/workflow/operator-request-actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/**
 * 진흥원 대시보드: 특정 업체와 무관한 일반 요청사항을 넥스트랩(운영사)에 등록한다.
 * 제목·내용만 작성해 '요청하기' → 넥스트랩 대시보드 '운영사 요청' 리스트에 올라간다.
 */
export function OperatorRequestGeneralButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!title.trim() || !body.trim()) {
      toast({ title: '제목과 내용을 입력하세요.', variant: 'destructive' });
      return;
    }
    setSending(true);
    const res = await createOperatorRequestAction({ title, body });
    setSending(false);
    if (res.ok) {
      toast({ title: '운영사(넥스트랩)로 요청을 보냈습니다.' });
      setTitle('');
      setBody('');
      setOpen(false);
    } else {
      toast({ title: '전송 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <Megaphone className="h-4 w-4" />
          요청사항 등록
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>운영사(넥스트랩) 요청사항 등록</DialogTitle>
          <DialogDescription>
            제목과 내용을 작성해 요청하면 넥스트랩 대시보드에 표시됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orq-title">제목</Label>
            <Input
              id="orq-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="요청 제목"
              maxLength={200}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orq-body">내용</Label>
            <Textarea
              id="orq-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="요청 내용을 작성하세요."
              rows={5}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            취소
          </Button>
          <Button type="button" onClick={send} disabled={sending}>
            {sending ? '보내는 중…' : '요청하기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
