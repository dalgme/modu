'use client';

import { useTransition } from 'react';

import { setGroupRoundsAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface RoundGroup {
  id: string;
  code: string;
  name: string;
  required_rounds: number;
  status: string;
  caseCount: number;
}

/**
 * 라운드별 회차 수 (2026-10-30) — 운영 설정 [행사 기본 설정]·[사업그룹] 탭 공용.
 * 실제 회차 수는 라운드(support_types.required_rounds) 값이고, 행사 '기본 회차 수'는 새 라운드의 초기값일 뿐이다.
 * 영향(초과 이행·검수 중)이 있으면 확인 후 재요청 — 서버 가드(setGroupRoundsAction)와 같은 판정.
 */
export function GroupRoundsPanel({ groups, defaultRequiredRounds }: { groups: RoundGroup[]; defaultRequiredRounds: number }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();

  const saveRounds = (g: RoundGroup, fd: FormData) =>
    start(async () => {
      const rounds = Number(fd.get('rounds'));
      let r = await setGroupRoundsAction({ groupId: g.id, rounds });
      if (!r.ok && r.needConfirm) {
        if (!window.confirm(r.error)) {
          toast({ title: '저장을 취소했습니다.' });
          return;
        }
        r = await setGroupRoundsAction({ groupId: g.id, rounds, confirm: true });
      }
      toast(r.ok ? { title: '회차 수를 저장했습니다.', description: r.message } : { title: r.error, variant: 'destructive' });
    });

  if (groups.length === 0) return null;
  return (
    <section className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
      <p className="font-semibold">라운드별 멘토링 회차 수</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        라운드마다 멘티 1명이 받는 멘토링 회차 수입니다. 숫자를 바꾸고 그 줄의 [적용]을 누르면 바로 반영됩니다 — 멘토 회차 칸·종결 요청·검수 승인·만족도 개시가 이 값을 따릅니다. (행사 &lsquo;기본 회차 수&rsquo; {defaultRequiredRounds}회는 새로 만드는 라운드의 초기값입니다.)
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {groups.map((g) => (
          <li key={g.id}>
            <form action={(fd) => saveRounds(g, fd)} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <span className="min-w-0 flex-1 text-sm font-medium">
                <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-xs">{g.code}</span>
                {g.name}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  케이스 {g.caseCount}건{g.status !== 'active' ? ' · 종료' : ''} · 현재 {g.required_rounds}회
                </span>
              </span>
              <label className="flex items-center gap-1 text-sm">
                <input
                  key={`${g.id}-${g.required_rounds}`}
                  name="rounds"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={g.required_rounds}
                  disabled={pending}
                  className="h-9 w-20 rounded-md border bg-background px-2 text-right text-base sm:text-sm"
                  aria-label={`${g.name} 회차 수`}
                />
                회
              </label>
              <Button type="submit" size="sm" disabled={pending}>
                적용
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
