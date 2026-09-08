'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquareText, StopCircle, PlayCircle } from 'lucide-react';

import { notifyCampaignAction, setCampaignStatusAction } from '@/lib/surveys/campaign-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

/** 조사 상세 상단 액션 — 초대·독려 문자, 종료/재개 */
export function CampaignActions({ campaignId, status, unresponded }: { campaignId: string; status: string; unresponded: number }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const send = (onlyUnresponded: boolean) => {
    const who = onlyUnresponded ? `미참여자 ${unresponded}명` : '대상자 전원';
    if (!confirm(`${who}에게 조사 링크 문자를 발송할까요?`)) return;
    start(async () => {
      const r = await notifyCampaignAction(campaignId, onlyUnresponded, message);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: `발송 ${r.sent}건 · 실패 ${r.failed}건 · 휴대폰 없음 ${r.skipped}건` });
      router.refresh();
    });
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-background p-4">
      <p className="text-sm font-semibold">문자 발송</p>
      <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="문자 첫 줄 (비우면 기본 안내문). 링크는 자동으로 붙습니다." />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1" disabled={pending || status !== 'open'} onClick={() => send(false)}>
          <MessageSquareText className="h-4 w-4" /> 전원에게 초대 발송
        </Button>
        <Button size="sm" className="gap-1" disabled={pending || status !== 'open' || unresponded === 0} onClick={() => send(true)}>
          <MessageSquareText className="h-4 w-4" /> 미참여자 {unresponded}명 독려 발송
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto gap-1"
          disabled={pending}
          onClick={() => {
            const next = status === 'open' ? 'closed' : 'open';
            if (!confirm(next === 'closed' ? '조사를 종료할까요? 이후 응답이 막힙니다.' : '조사를 다시 열까요?')) return;
            start(async () => {
              const r = await setCampaignStatusAction(campaignId, next);
              toast(r.ok ? { title: next === 'closed' ? '조사를 종료했습니다.' : '조사를 다시 열었습니다.' } : { title: r.error, variant: 'destructive' });
              if (r.ok) router.refresh();
            });
          }}
        >
          {status === 'open' ? <><StopCircle className="h-4 w-4" /> 조사 종료</> : <><PlayCircle className="h-4 w-4" /> 다시 열기</>}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">행사별 문자 API(등록 시) 또는 플랫폼 기본 발신번호로 발송됩니다. 발송·실패 건수는 감사로그에 남습니다.</p>
    </div>
  );
}
