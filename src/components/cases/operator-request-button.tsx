'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

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
 * 발주처 케이스 상세 '신청 정보'에서 운영사에 처리 요청을 보낸다.
 * 업체 정보를 자동 연동해 표시하고, 제목·요청사항을 작성해 보내면 운영사 대시보드에 리스트업된다.
 */
export function OperatorRequestButton({
  caseId,
  businessName,
  ownerName,
  phone,
}: {
  caseId: string;
  businessName: string;
  ownerName: string;
  phone: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!title.trim() || !body.trim()) {
      toast({ title: '제목과 요청사항을 입력하세요.', variant: 'destructive' });
      return;
    }
    setSending(true);
    const res = await createOperatorRequestAction({ caseId, title, body });
    setSending(false);
    if (res.ok) {
      toast({ title: '운영사로 요청을 보냈습니다.' });
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
        <Button type="button" size="sm" variant="outline" className="gap-1.5">
          <Send className="h-3.5 w-3.5" />
          운영사 요청 등록
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>운영사 요청 등록</DialogTitle>
          <DialogDescription>
            아래 업체 기준으로 처리·확인을 요청합니다. 보내면 운영사 대시보드에 표시됩니다.
          </DialogDescription>
        </DialogHeader>

        {/* 업체 정보 자동 연동 */}
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="text-xs text-muted-foreground">대상 업체 (자동 연동)</p>
          <p className="mt-1 font-medium">{businessName}</p>
          <p className="text-xs text-muted-foreground">
            대표 {ownerName} · ☎ {phone}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="or-title">제목</Label>
            <Input
              id="or-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 멘토 배정 요청 / 서류 확인 요청"
              maxLength={200}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="or-body">요청사항</Label>
            <Textarea
              id="or-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="요청 내용을 구체적으로 작성하세요."
              rows={5}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            취소
          </Button>
          <Button type="button" onClick={send} disabled={sending} className="gap-1.5">
            <Send className="h-4 w-4" />
            {sending ? '보내는 중…' : '보내기'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
