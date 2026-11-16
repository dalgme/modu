'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { setGroupInstitutionSettlementAction } from '@/lib/settings/actions';

type Group = { id: string; name: string; status: string; enabled: boolean };

/**
 * 운영 설정 > 정산(원천징수·품의) 맨 위 — 라운드별 발주처 [정산 품의] 기능 켜기 (2026-11-16).
 * 기본 꺼짐 = 운영사가 검수 → 정산 품의 확인 → 지급 완료 → 수당 산출내역 다운로드를 모두 진행한다.
 */
export function GroupInstitutionSettlementPanel({ groups, canEdit }: { groups: Group[]; canEdit: boolean }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <h3 className="text-base font-bold">라운드별 발주처 [정산 품의] 기능</h3>
      <p className="text-xs text-muted-foreground">
        기본(꺼짐)은 <b>운영사가 검수 → 정산 품의 확인 → 지급 완료 → 수당 산출내역 다운로드</b>를 모두 진행하고, 발주처에는 품의 알림·확인 대기 건이 생기지 않습니다.
        [켜기]로 바꾸면 그 라운드의 정산이 든 품의는 발주처 화면에 도착하고 발주처가 정산 확인·반려합니다. 바꾸면 이미 제출된 품의에도 바로 적용됩니다(정산 확인·지급된 품의는 그대로).
      </p>
      <div className="flex flex-col divide-y rounded-lg border bg-background">
        {groups.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">라운드가 없습니다.</p>}
        {groups.map((g) => (
          <Row key={g.id} group={g} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}

function Row({ group, canEdit }: { group: Group; canEdit: boolean }) {
  const [value, setValue] = useState(group.enabled);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const pick = async (next: boolean) => {
    if (next === value || pending || !canEdit) return;
    const ok = await confirm({
      title: next ? `${group.name}: 발주처 [정산 품의] 기능 켜기` : `${group.name}: 발주처 [정산 품의] 기능 끄기`,
      description: next ? '이 라운드 정산이 든 품의는 발주처가 정산 확인·반려합니다. 운영사 화면에서는 [정산 확인] 버튼이 사라집니다.' : '이 라운드 정산이 든 품의는 운영사가 직접 정산 확인합니다. 발주처 화면에서 이 라운드 품의가 사라집니다.',
      impact: ['제출 상태로 기다리는 품의에도 바로 적용됩니다.', '정산 확인·지급 완료된 품의는 바뀌지 않습니다.'],
      confirmLabel: next ? '켜기' : '끄기',
    });
    if (!ok) return;
    const prev = value;
    setValue(next);
    start(async () => {
      const r = await setGroupInstitutionSettlementAction({ groupId: group.id, enabled: next });
      if (r.ok) {
        toast({ title: r.message ?? '저장했습니다.' });
        router.refresh();
      } else {
        setValue(prev);
        toast({ title: r.error, variant: 'destructive' });
      }
    });
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
      {dialog}
      <span className="text-sm font-medium">
        {group.name}
        {group.status === 'ended' && <span className="ml-1 text-xs font-normal text-muted-foreground">(종료)</span>}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{value ? '발주처가 정산 확인' : '운영사가 정산 확인'}</span>
      </span>
      <div role="radiogroup" aria-label={`${group.name} 발주처 정산 품의 기능`} className="inline-flex rounded-full border bg-muted p-0.5">
        {[
          { v: false, label: '끄기 (운영사)', on: 'bg-sky-700 text-white' },
          { v: true, label: '켜기 (발주처)', on: 'bg-amber-600 text-white' },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            disabled={pending || !canEdit}
            onClick={() => void pick(o.v)}
            className={cn('min-w-[88px] rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-60', value === o.v ? o.on : 'text-muted-foreground hover:text-foreground')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
