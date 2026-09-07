'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';

import type { LimitRow, RateRow } from '@/lib/settings/data';
import { addLimitAction, addRateAction, deleteFutureRowAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { formatKRW } from '@/lib/utils/format';

/** 단가·한도 — 행 추가(적용일) 방식. 과거 회차는 스냅샷이라 흔들리지 않는다. */
export function RatesLimits({ rates, limits, groups, today }: { rates: RateRow[]; limits: LimitRow[]; groups: { id: string; name: string }[]; today: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const groupName = (id: string | null) => (id ? (groups.find((g) => g.id === id)?.name ?? '?') : '행사 기본');
  const run = (fn: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? { title: ok } : { title: r.error, variant: 'destructive' });
    });

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">컨설팅 단가 · 일일 금액 상한</h3>
        <p className="text-xs text-muted-foreground">유형별 단가(회당)와 같은 멘티·같은 날 합산 상한. 그룹 override 는 그룹을 고르세요. 적용일 이후 등록되는 회차부터 반영됩니다.</p>
        <form action={(fd) => run(() => addRateAction(Object.fromEntries(fd.entries())), '단가를 추가했습니다.')} className="mt-3 grid gap-2 sm:grid-cols-6">
          <select name="support_type_id" defaultValue="" className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">행사 기본</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select name="mode" defaultValue="online" className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="online">온라인</option>
            <option value="offline">오프라인</option>
          </select>
          <Input name="unit_price" type="number" min={0} step={1000} placeholder="단가(원)" required />
          <Input name="daily_cap_amount" type="number" min={0} step={1000} placeholder="일일 상한(원)" required />
          <Input name="effective_from" type="date" defaultValue={today} required />
          <Button type="submit" size="sm" disabled={pending}>
            추가
          </Button>
        </form>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1">범위</th><th className="py-1">유형</th><th className="py-1 text-right">단가</th><th className="py-1 text-right">일일 상한</th><th className="py-1">적용일</th><th />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-1">{groupName(r.support_type_id)}</td>
                <td className="py-1">{r.mode === 'online' ? '온라인' : '오프라인'}</td>
                <td className="py-1 text-right tabular-nums">{formatKRW(Number(r.unit_price))}</td>
                <td className="py-1 text-right tabular-nums">{formatKRW(Number(r.daily_cap_amount))}</td>
                <td className="py-1 tabular-nums">{r.effective_from}{r.effective_from > today && <span className="ml-1 text-xs text-amber-700">예정</span>}</td>
                <td className="py-1 text-right">
                  {r.effective_from > today && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteFutureRowAction('consulting_rates', r.id), '삭제했습니다.')}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">운영 한도</h3>
        <p className="text-xs text-muted-foreground">멘토 1일 최대 멘티(건) 수 · 같은 멘티 1일 최대 회차 수.</p>
        <form action={(fd) => run(() => addLimitAction(Object.fromEntries(fd.entries())), '한도를 추가했습니다.')} className="mt-3 grid gap-2 sm:grid-cols-5">
          <select name="support_type_id" defaultValue="" className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">행사 기본</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <Input name="mentor_daily_case_limit" type="number" min={1} max={50} placeholder="멘토 1일 건수" required />
          <Input name="case_daily_round_limit" type="number" min={1} max={20} placeholder="멘티 1일 회차" required />
          <Input name="effective_from" type="date" defaultValue={today} required />
          <Button type="submit" size="sm" disabled={pending}>
            추가
          </Button>
        </form>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1">범위</th><th className="py-1 text-right">멘토 1일 건수</th><th className="py-1 text-right">멘티 1일 회차</th><th className="py-1">적용일</th><th />
            </tr>
          </thead>
          <tbody>
            {limits.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-1">{groupName(r.support_type_id)}</td>
                <td className="py-1 text-right tabular-nums">{r.mentor_daily_case_limit}</td>
                <td className="py-1 text-right tabular-nums">{r.case_daily_round_limit}</td>
                <td className="py-1 tabular-nums">{r.effective_from}{r.effective_from > today && <span className="ml-1 text-xs text-amber-700">예정</span>}</td>
                <td className="py-1 text-right">
                  {r.effective_from > today && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteFutureRowAction('operating_limits', r.id), '삭제했습니다.')}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
