'use client';

import { useState } from 'react';
import { MessageSquare, Check, Loader2 } from 'lucide-react';

import { sendMenteeGuideSmsAction } from '@/lib/workflow/mentee-guide-sms-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

/**
 * 멘티기업 bar의 '멘티 안내 문자보내기' 버튼.
 * 발송되면 버튼이 사라지고 발송일시 칩으로 바뀐다. (한 번 더 눌러 발송 — 오발송 방지)
 * 카드 전체 클릭(케이스 상세)과 겹치지 않도록 클릭 이벤트 전파를 막는다.
 */
export function MenteeGuideSmsButton({
  caseId,
  sentAt: initialSentAt,
}: {
  caseId: string;
  sentAt?: string | null;
}) {
  const { toast } = useToast();
  const [sentAt, setSentAt] = useState<string | null>(initialSentAt ?? null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (sentAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-status-approved/40 bg-status-approved/10 px-2.5 py-1.5 text-xs font-medium text-status-approved">
        <Check className="h-3.5 w-3.5" />
        안내문자 발송 · {formatDateTime(sentAt)}
      </span>
    );
  }

  async function onSend() {
    setBusy(true);
    const res = await sendMenteeGuideSmsAction(caseId);
    setBusy(false);
    setConfirming(false);
    if (res.ok) {
      setSentAt(res.sentAt);
      toast({ title: '멘티 안내 문자를 발송했습니다.' });
    } else {
      toast({ title: '발송 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirming) void onSend();
        else setConfirming(true);
      }}
      onBlur={() => setConfirming(false)}
      className="gap-1.5 border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <MessageSquare className="h-3.5 w-3.5" />
      )}
      {busy ? '발송 중…' : confirming ? '한 번 더 눌러 발송' : '멘티 안내 문자보내기'}
    </Button>
  );
}
