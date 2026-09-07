'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock, Unlock } from 'lucide-react';

import { openEditGrantAction, closeEditGrantAction } from '@/lib/workflow/edit-grant-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';
import { useToast } from '@/hooks/use-toast';

export interface ActiveEditGrant {
  target: 'nextlab' | 'mentor';
  expiresAt: string;
}

/**
 * 임시 수정권한 개설/마감 패널 (넥스트랩 전용).
 * '넥스트랩 검수 완료(reviewed)' 단계에서 대상(넥스트랩/담당 멘토)에게 한시적으로 수정을 허용한다.
 * 별도 지정이 없으면 24시간 후 자동 만료, 그 전 수동 마감 가능.
 */
export function EditGrantPanel({
  caseId,
  active,
}: {
  caseId: string;
  active: ActiveEditGrant | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<'nextlab' | 'mentor'>('mentor');
  const [hours, setHours] = useState(24);

  async function open() {
    setBusy(true);
    const res = await openEditGrantAction(caseId, target, hours);
    setBusy(false);
    if (res.ok) {
      toast({ title: '임시 수정권한을 열었습니다.' });
      router.refresh();
    } else {
      toast({ title: '개설 실패', description: res.error, variant: 'destructive' });
    }
  }

  async function close() {
    if (!window.confirm('임시 수정권한을 지금 닫을까요?')) return;
    setBusy(true);
    const res = await closeEditGrantAction(caseId);
    setBusy(false);
    if (res.ok) {
      toast({ title: '임시 수정권한을 닫았습니다.' });
      router.refresh();
    } else {
      toast({ title: '마감 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Card className="border-amber-300/60 dark:border-amber-800/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {active ? (
            <Unlock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
          임시 수정권한 (넥스트랩 전용)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          검수 완료 단계에서 넥스트랩 또는 담당 멘토에게 한시적으로 지원신청서 수정을 허용합니다. 별도
          지정이 없으면 24시간 후 자동으로 닫힙니다.
        </p>
      </CardHeader>
      <CardContent>
        {active ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
            <div className="text-sm">
              <span className="font-semibold text-amber-800 dark:text-amber-300">
                수정권한 열림
              </span>
              <span className="ml-2 text-muted-foreground">
                대상 {active.target === 'nextlab' ? '넥스트랩' : '담당 멘토'} · 만료{' '}
                {formatDateTime(active.expiresAt)}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={close}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              지금 닫기
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">대상</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value === 'nextlab' ? 'nextlab' : 'mentor')}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="mentor">담당 멘토</option>
                <option value="nextlab">넥스트랩</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">유효 시간(시간)</span>
              <input
                type="number"
                min={1}
                max={72}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value) || 24)}
                className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <Button type="button" size="sm" disabled={busy} onClick={open} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
              임시 수정권한 열기
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
