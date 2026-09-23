'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { saveMatchingRulesAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export interface MatchingRulesValue {
  groups: { id: string; name: string; code: string; maxMenteesPerMentor: number }[];
}

/** 운영 설정 › 매칭 규칙 (P25-04) — 라운드(사업그룹)별 멘토 1인당 최대 멘티 수. 기본 2명. */
export function MatchingRulesForm({ value }: { value: MatchingRulesValue }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [groups, setGroups] = useState(value.groups.map((g) => ({ ...g, text: String(g.maxMenteesPerMentor) })));

  const save = () => {
    const payload = groups.map((g) => ({ id: g.id, maxMenteesPerMentor: Number(g.text) }));
    if (payload.some((g) => !Number.isInteger(g.maxMenteesPerMentor) || g.maxMenteesPerMentor < 1)) {
      toast({ title: '1 이상의 정수를 입력하세요.', variant: 'destructive' });
      return;
    }
    start(async () => {
      const r = await saveMatchingRulesAction({ groups: payload });
      toast(r.ok ? { title: '매칭 규칙을 저장했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="flex max-w-xl flex-col gap-4 rounded-xl border bg-background p-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        <b>멘토 1인당 최대 멘티 수</b>를 라운드(사업그룹)별로 정합니다. 수동 배정·재배정·자동 매칭이 모두 이 값을 넘지 못하며,
        자동 추천은 정원이 남은 멘토만 후보로 올립니다. 그룹 지정이 있는 멘토는 지정된 그룹에서만 후보가 됩니다(회원 명단 › 멘토 명단에서 지정).
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1">라운드(그룹)</th>
            <th className="py-1 text-right">멘토 1인당 최대 멘티</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.id} className="border-b last:border-0">
              <td className="py-1.5">
                <span className="text-muted-foreground">{g.code}</span> · {g.name}
              </td>
              <td className="py-1.5 text-right">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={g.text}
                  onChange={(e) => setGroups((prev) => prev.map((x, xi) => (xi === i ? { ...x, text: e.target.value } : x)))}
                  className="ml-auto h-8 w-24 text-right"
                  disabled={pending}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">사업그룹이 없습니다. [사업그룹·필수서류] 탭에서 먼저 개설하세요.</p>}
      <div>
        <Button onClick={save} disabled={pending || groups.length === 0}>{pending ? '저장 중…' : '매칭 규칙 저장'}</Button>
      </div>
    </div>
  );
}
