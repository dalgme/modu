'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { saveBudgetsAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export interface BudgetFormValue {
  programBudget: number | null;
  groups: { id: string; name: string; budget: number | null }[];
}

const toNum = (s: string): number | null => {
  const digits = s.replace(/[^\d]/g, '');
  return digits === '' ? null : Number(digits);
};
const fmt = (n: number | null) => (n === null ? '' : n.toLocaleString('ko-KR'));

/** 운영 설정 › 예산 (P22) — 행사 전체·그룹별 멘토링 예산(지급총액 기준). 비우면 미설정(게이지 숨김). */
export function BudgetForm({ value }: { value: BudgetFormValue }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [program, setProgram] = useState(fmt(value.programBudget));
  const [groups, setGroups] = useState(value.groups.map((g) => ({ ...g, text: fmt(g.budget) })));

  const save = () => {
    start(async () => {
      const r = await saveBudgetsAction({
        programBudget: toNum(program),
        groups: groups.map((g) => ({ id: g.id, budget: toNum(g.text) })),
      });
      toast(r.ok ? { title: '예산을 저장했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="flex max-w-xl flex-col gap-4 rounded-xl border bg-background p-4">
      <p className="text-xs text-muted-foreground">
        멘토링 지급 예산을 <b>지급총액(원천징수 공제 전)</b> 기준으로 입력합니다. 입력하면 리포트·발주처 정산 화면에 집행률 게이지가 표시됩니다. 비우면 미설정입니다.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold">행사 전체 예산 (원)</span>
        <Input value={program} onChange={(e) => setProgram(fmt(toNum(e.target.value)))} placeholder="예: 32,000,000" inputMode="numeric" disabled={pending} />
      </label>
      <div className="flex flex-col gap-2 border-t pt-3">
        <span className="text-sm font-semibold">사업그룹별 예산 (선택)</span>
        {groups.map((g, i) => (
          <label key={g.id} className="flex items-center gap-2 text-sm">
            <span className="w-40 truncate text-muted-foreground">{g.name}</span>
            <Input
              value={g.text}
              onChange={(e) => setGroups((prev) => prev.map((x, xi) => (xi === i ? { ...x, text: fmt(toNum(e.target.value)) } : x)))}
              placeholder="미설정"
              inputMode="numeric"
              className="max-w-[200px]"
              disabled={pending}
            />
            <span className="text-xs text-muted-foreground">원</span>
          </label>
        ))}
      </div>
      <div>
        <Button onClick={save} disabled={pending}>{pending ? '저장 중…' : '예산 저장'}</Button>
      </div>
    </div>
  );
}
