'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Bell } from 'lucide-react';

import { createSupplementRequestAction } from '@/lib/workflow/supplement-actions';
import type { SupplementRequestItem } from '@/lib/data/supplement-requests';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/format';

const PHASES = [
  { key: 'pre', label: '지원신청(사전)' },
  { key: 'post', label: '자금신청(사후)' },
  { key: 'general', label: '일반' },
] as const;

const PHASE_LABEL: Record<string, string> = {
  pre: '지원신청(사전)',
  post: '자금신청(사후)',
  general: '일반',
};

/**
 * 운영진·담당 멘토가 멘티에게 보완 요청을 보내는 폼 + 최근 요청 이력.
 * 등록 시 멘티 대시보드에 노출되고 문자로도 안내된다.
 */
export function SupplementRequestForm({
  caseId,
  requests,
}: {
  caseId: string;
  requests: SupplementRequestItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [phase, setPhase] = useState<'pre' | 'post' | 'general'>('pre');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSend() {
    if (!message.trim()) {
      toast({ title: '요청 내용을 입력하세요.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const res = await createSupplementRequestAction({ caseId, phase, message });
    setBusy(false);
    if (res.ok) {
      toast({ title: '보완 요청을 보냈습니다.', description: '멘티 화면에 표시되고 문자로도 안내됩니다.' });
      setMessage('');
      router.refresh();
    } else {
      toast({ title: '요청 실패', description: res.error, variant: 'destructive' });
    }
  }

  const open = requests.filter((r) => !r.resolvedAt);
  const done = requests.filter((r) => r.resolvedAt);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PHASES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPhase(p.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              phase === p.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="supplement-msg" className="text-xs text-muted-foreground">
          어떤 서류를 보완해야 하는지 구체적으로 적어 주세요.
        </Label>
        <Textarea
          id="supplement-msg"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="예: ○○간판 견적서 금액이 사업자등록증과 다릅니다. 정정된 견적서를 다시 올려 주세요."
        />
      </div>
      <div>
        <Button type="button" size="sm" onClick={onSend} disabled={busy} className="gap-1.5">
          <Send className="h-3.5 w-3.5" />
          {busy ? '보내는 중…' : '보완 요청 보내기'}
        </Button>
      </div>

      {open.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <Bell className="h-3.5 w-3.5" /> 처리 대기 중 {open.length}건
          </p>
          <ul className="flex flex-col gap-1">
            {open.map((r) => (
              <li key={r.id} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                <span className="mr-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  {PHASE_LABEL[r.phase]}
                </span>
                {r.message}
                <span className="ml-1 text-[11px] text-muted-foreground">· {formatDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {done.length > 0 && (
        <p className="text-xs text-muted-foreground">처리 완료 {done.length}건</p>
      )}
    </div>
  );
}
