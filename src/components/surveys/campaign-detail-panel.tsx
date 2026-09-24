'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, MessageSquareText, StopCircle, PlayCircle } from 'lucide-react';

import { duplicateCampaignAction, notifyCampaignAction, setCampaignStatusAction } from '@/lib/surveys/campaign-actions';
import { ConfirmDialog, useConfirm } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

/** 조사 상세 상단 액션 — 초대·독려 문자(미리보기 확인), 종료/재개 */
export function CampaignActions({ campaignId, status, unresponded, total, programName, title }: { campaignId: string; status: string; unresponded: number; total: number; programName?: string; title?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [sendFor, setSendFor] = useState<null | boolean>(null); // onlyUnresponded
  const { confirm, dialog } = useConfirm();

  const send = (onlyUnresponded: boolean) =>
    start(async () => {
      const r = await notifyCampaignAction(campaignId, onlyUnresponded, message);
      setSendFor(null);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: `발송 ${r.sent}건 · 실패 ${r.failed}건 · 휴대폰 없음 ${r.skipped}건` });
      router.refresh();
    });

  const previewHead = message.trim() || `[${programName ?? '행사'}] {이름}님, '${title ?? '조사'}'에 참여해 주세요.`;
  const count = sendFor ? unresponded : total;

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-background p-4">
      {dialog}
      <p className="text-sm font-semibold">문자 발송</p>
      <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="문자 첫 줄 (비우면 기본 안내문). 링크는 자동으로 붙습니다." aria-label="문자 첫 줄" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1" disabled={pending || status !== 'open'} onClick={() => setSendFor(false)}>
          <MessageSquareText className="h-4 w-4" /> 전원에게 초대 발송
        </Button>
        <Button size="sm" className="gap-1" disabled={pending || status !== 'open' || unresponded === 0} onClick={() => setSendFor(true)}>
          <MessageSquareText className="h-4 w-4" /> 미참여자 {unresponded}명 독려 발송
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto gap-1"
          disabled={pending}
          onClick={() =>
            void (async () => {
              const next = status === 'open' ? 'closed' : 'open';
              const ok = await confirm(
                next === 'closed'
                  ? { title: '조사 종료', description: '조사를 종료합니다. 이후 응답 링크는 "종료된 조사"로 안내되고 새 응답은 막힙니다.', impact: ['이미 들어온 응답은 유지됩니다.', '필요하면 [다시 열기]로 재개할 수 있습니다.'], confirmLabel: '종료', severity: 'danger' }
                  : { title: '조사 열기', description: '조사를 진행 중 상태로 바꿉니다. 대상자는 기간 안에 응답할 수 있습니다.', confirmLabel: '열기' },
              );
              if (!ok) return;
              start(async () => {
                const r = await setCampaignStatusAction(campaignId, next);
                toast(r.ok ? { title: next === 'closed' ? '조사를 종료했습니다.' : '조사를 열었습니다.' } : { title: r.error, variant: 'destructive' });
                if (r.ok) router.refresh();
              });
            })()
          }
        >
          {status === 'open' ? <><StopCircle className="h-4 w-4" /> 조사 종료</> : <><PlayCircle className="h-4 w-4" /> {status === 'draft' ? '조사 시작' : '다시 열기'}</>}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">행사별 문자 API(등록 시) 또는 플랫폼 기본 발신번호로 발송됩니다. 발송·실패 건수는 감사로그에 남습니다.</p>

      <ConfirmDialog
        open={sendFor !== null}
        onOpenChange={(o) => {
          if (!o) setSendFor(null);
        }}
        title={sendFor ? `미참여자 ${unresponded}명에게 독려 발송` : `대상자 전원 ${total}명에게 초대 발송`}
        description="아래 문안 뒤에 개인별 응답 링크가 자동으로 붙어 발송됩니다."
        impact={[`수신자 ${count}명 (휴대폰 없는 대상자는 자동 제외)`, '발송 횟수와 마지막 발송 시각이 대상자 표에 기록됩니다.']}
        confirmLabel="발송"
        pending={pending}
        onConfirm={() => send(!!sendFor)}
      >
        <pre className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 font-sans text-xs leading-relaxed">{previewHead}{'\n'}https://…/s/{'{개인 토큰}'}</pre>
      </ConfirmDialog>
    </div>
  );
}

/** 조사 목록 행의 [복제] — 제목·양식·안내문·대상 규칙을 복사해 draft 로 만든다 (P30) */
export function CampaignDuplicateButton({ campaignId, title }: { campaignId: string; title: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-[11px]"
        disabled={pending}
        title="이 조사의 설정을 복사해 새 조사를 만듭니다"
        onClick={() =>
          void (async () => {
            const ok = await confirm({
              title: '조사 복제',
              description: `"${title}" 의 양식·안내문·대상 규칙을 복사해 새 조사를 만듭니다.`,
              impact: ['대상자는 현재 명단 기준으로 새로 확정되고, 응답은 복사되지 않습니다.', '기간은 오늘부터 14일, 상태는 "준비"로 만들어지며 상세에서 [조사 시작]을 눌러야 열립니다.'],
              confirmLabel: '복제',
            });
            if (!ok) return;
            start(async () => {
              const r = await duplicateCampaignAction(campaignId);
              if (!r.ok) {
                toast({ title: r.error, variant: 'destructive' });
                return;
              }
              toast({ title: `복제했습니다 (대상 ${r.targets}명). 상세에서 기간을 확인하고 시작하세요.` });
              router.push(`/nextlab/surveys/${r.id}`);
            });
          })()
        }
      >
        <Copy className="h-3.5 w-3.5" /> 복제
      </Button>
    </>
  );
}
