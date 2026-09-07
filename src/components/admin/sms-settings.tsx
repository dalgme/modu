'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import { sendTestSmsAction } from '@/lib/notifications/sms-admin-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/** 관리자 문자 대시보드: 테스트 발송 + 새로고침 */
export function SmsTestForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [to, setTo] = useState('');
  const [text, setText] = useState('[테스트] 플랫폼 문자발송 테스트입니다.');
  const [sending, setSending] = useState(false);

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const r = await sendTestSmsAction({ to, text });
    setSending(false);
    if (r.ok) {
      toast({ title: '테스트 문자가 발송되었습니다.', description: '발송 리스트에서 상태를 확인하세요.' });
      setTimeout(() => router.refresh(), 1500);
    } else {
      toast({ title: '발송 실패', description: r.error, variant: 'destructive' });
    }
  }

  return (
    <form onSubmit={sendTest} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sms-to">수신번호</Label>
          <Input
            id="sms-to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="01012345678"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="sms-text">메시지 (90byte 초과 시 LMS 자동전환)</Label>
          <Textarea id="sms-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
          <RefreshCw className="h-4 w-4" />
          새로고침
        </Button>
        <Button type="submit" disabled={!configured || sending}>
          {sending ? '발송 중…' : '테스트 발송'}
        </Button>
      </div>
    </form>
  );
}
