'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';

import { createOperatorRequestAction } from '@/lib/workflow/operator-request-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

/**
 * 발주처 '요청/문의' — 제목·내용만 간단히 입력해 운영사에 요청을 보낸다.
 * 전송하면 운영사 대시보드 '운영사 요청' 리스트에 올라간다.
 */
export function OperatorRequestForm() {
  const router = useRouter();
  const { toast } = useToast();
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
      toast({ title: '운영사에 요청을 보냈습니다.' });
      setTitle('');
      setBody('');
      router.refresh();
    } else {
      toast({ title: '전송 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">운영사에 요청/문의하기</CardTitle>
        <p className="text-xs text-muted-foreground">
          제목과 내용을 작성해 보내면 운영사 대시보드 &lsquo;운영사 요청&rsquo;에 즉시 등록됩니다.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="oreq-title">제목</Label>
          <Input
            id="oreq-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 특정 업체 처리 요청 / 시스템 문의"
            maxLength={200}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="oreq-body">내용</Label>
          <Textarea
            id="oreq-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="요청·문의 내용을 자유롭게 작성하세요."
            rows={5}
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={send} disabled={sending} className="gap-1.5">
            <Send className="h-4 w-4" />
            {sending ? '보내는 중…' : '요청 보내기'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
