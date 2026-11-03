'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { setGroupSurveyEnabledAction } from '@/lib/settings/actions';

/** 운영 설정 > 만족도 양식 맨 위 — 라운드별 설문조사 사용/미사용 (2026-11-03) */
export function GroupSurveyPanel({ groups, canEdit }: { groups: { id: string; name: string; surveyEnabled: boolean; status: string }[]; canEdit: boolean }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-sky-300 bg-sky-50/60 p-4 dark:border-sky-800 dark:bg-sky-950/30">
      <h3 className="text-base font-bold">라운드별 설문조사 사용</h3>
      <p className="text-xs text-muted-foreground">
        [미사용]으로 바꾸면 그 라운드 멘티에게 만족도 설문이 열리지 않습니다 — 자동 개시·멘티 화면 표시·응답·독려 문자·회원 명단 [만족도 생성]·그 라운드를 대상으로 한 조사 개설이 모두 꺼집니다. 이미 받은 응답은 그대로 남고, 다시 [사용]으로 바꾸면 조건이 된 멘티부터 열립니다.
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

function Row({ group, canEdit }: { group: { id: string; name: string; surveyEnabled: boolean; status: string }; canEdit: boolean }) {
  const [value, setValue] = useState(group.surveyEnabled);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const pick = (next: boolean) => {
    if (next === value || pending || !canEdit) return;
    const prev = value;
    setValue(next);
    start(async () => {
      const r = await setGroupSurveyEnabledAction({ groupId: group.id, enabled: next });
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
      <span className="text-sm font-medium">
        {group.name}
        {group.status === 'ended' && <span className="ml-1 text-xs font-normal text-muted-foreground">(종료)</span>}
      </span>
      <div role="radiogroup" aria-label={`${group.name} 설문조사`} className="inline-flex rounded-full border bg-muted p-0.5">
        {[
          { v: true, label: '사용', on: 'bg-emerald-600 text-white' },
          { v: false, label: '미사용', on: 'bg-slate-600 text-white' },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            disabled={pending || !canEdit}
            onClick={() => pick(o.v)}
            className={cn('min-w-[64px] rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-60', value === o.v ? o.on : 'text-muted-foreground hover:text-foreground')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
