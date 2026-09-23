'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setMentorGroupMembershipAction, setMentorGroupWithholdingAction } from '@/lib/mentors/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export type Withholding = 'other_income' | 'business_income' | 'none' | '';
export const WH_LABEL: Record<Withholding, string> = { '': '그룹 기본', other_income: '기타소득', business_income: '사업소득', none: '없음' };

export interface MentorGroupInfo {
  id: string;
  name: string;
  /** 그룹 지정 여부 (지정 없음 = 모든 그룹에서 사용) */
  designated: boolean;
  /** 그룹 명부 행이 있을 때의 원천징수 override (명부 행 자체가 없으면 null) */
  withholding: Withholding | null;
}

/**
 * 멘토 계정 관리 [정보 수정] 패널의 그룹 지정 칩 + 원천징수(버튼 → 팝업 개별 변경) (P27-14: 멘토별 진행현황 표에서 이전).
 */
export function MentorGroupControls({ userId, mentorName, groups }: { userId: string; mentorName: string; groups: MentorGroupInfo[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [whEdit, setWhEdit] = useState<{ groupId: string; groupName: string; value: Withholding } | null>(null);
  const designatedAny = groups.some((g) => g.designated);
  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3 text-xs sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold">그룹 지정</span>
        <div className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              disabled={pending}
              title={g.designated ? `${g.name} 지정됨 — 누르면 해제` : `${g.name} 에 지정`}
              onClick={() => start(async () => { const r = await setMentorGroupMembershipAction(g.id, userId, !g.designated); toast(r.ok ? { title: g.designated ? '그룹 지정 해제' : '그룹 지정' } : { title: r.error, variant: 'destructive' }); if (r.ok) router.refresh(); })}
              className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', g.designated ? 'border-violet-500 bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200' : 'border-border text-muted-foreground')}
            >
              {g.name}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">{designatedAny ? '지정된 그룹에서만 배정 후보가 됩니다.' : '지정 없음 → 모든 그룹에서 후보로 사용됩니다.'}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-semibold">원천징수 (그룹별 · 그룹 기본 권장)</span>
        <div className="flex flex-wrap gap-1">
          {groups.map((g) => {
            const v = g.withholding ?? '';
            return (
              <button
                key={g.id}
                type="button"
                disabled={pending}
                onClick={() => setWhEdit({ groupId: g.id, groupName: g.name, value: v })}
                title={`${g.name} 원천징수 ${WH_LABEL[v]} — 누르면 개별 변경 팝업`}
                className={cn('inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px]', v ? 'border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'border-border bg-background text-muted-foreground')}
              >
                <span className="font-normal">{g.name}</span>
                <span className="font-semibold">{WH_LABEL[v]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Dialog open={!!whEdit} onOpenChange={(o) => { if (!o) setWhEdit(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>원천징수 개별 변경</DialogTitle>
            <DialogDescription>
              {whEdit ? `${mentorName} · ${whEdit.groupName}` : ''} — 원천징수는 그룹 기본(운영 설정)으로 통일하는 것을 권장합니다. 이 멘토만 다르게 적용해야 할 때만 변경하세요. 이후 확정되는 정산부터 적용됩니다.
            </DialogDescription>
          </DialogHeader>
          {whEdit && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const cur = whEdit;
                start(async () => {
                  const r = await setMentorGroupWithholdingAction(cur.groupId, userId, cur.value);
                  toast(r.ok ? { title: `원천징수: ${WH_LABEL[cur.value]}` } : { title: r.error, variant: 'destructive' });
                  if (r.ok) {
                    setWhEdit(null);
                    router.refresh();
                  }
                });
              }}
              className="flex flex-col gap-3"
            >
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(WH_LABEL) as Withholding[]).map((k) => (
                  <label key={k || 'default'} className={cn('flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm', whEdit.value === k && 'border-primary bg-primary/5')}>
                    <input type="radio" name="wh" checked={whEdit.value === k} onChange={() => setWhEdit({ ...whEdit, value: k })} />
                    {WH_LABEL[k]}{k === '' && <span className="text-[10px] text-muted-foreground">(권장)</span>}
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setWhEdit(null)} disabled={pending}>취소</Button>
                <Button type="submit" disabled={pending}>{pending ? '저장 중…' : '저장'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
