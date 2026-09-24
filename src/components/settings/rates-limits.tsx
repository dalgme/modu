'use client';

import { useMemo, useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';

import type { LimitRow, RateRow } from '@/lib/settings/data';
import { addLimitAction, addRateAction, deleteFutureRowAction } from '@/lib/settings/actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { AmountInput } from '@/components/ui/amount-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { formatKRW } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

type Mode = 'online' | 'offline';
const MODE_LABEL: Record<Mode, string> = { online: '온라인', offline: '오프라인' };

/** 오늘 기준 적용 중인 행 — 같은 범위·유형에서 effective_from ≤ today 중 가장 늦은 것 */
function currentOf<T extends { support_type_id: string | null; effective_from: string }>(rows: T[], groupId: string | null, today: string, pick: (r: T) => boolean = () => true): T | null {
  const list = rows.filter((r) => r.support_type_id === groupId && r.effective_from <= today && pick(r)).sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return list[0] ?? null;
}

/**
 * 단가·한도 — 행 추가(적용일) 방식. 과거 회차는 스냅샷이라 흔들리지 않는다.
 * 상단 "현재 적용" 표는 그룹 × 유형별로 오늘 유효한 값을 계산한다(그룹 행 없으면 행사 기본으로 폴백, 배지로 구분).
 * 추가 전 확인창에서 변경 전 → 변경 후를 보여준다.
 */
export function RatesLimits({ rates, limits, groups, today, defaultGroupId = null }: { rates: RateRow[]; limits: LimitRow[]; groups: { id: string; name: string }[]; today: string; /** 현재 범위 그룹 — 추가 폼 기본 범위 */ defaultGroupId?: string | null }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const groupName = (id: string | null) => (id ? (groups.find((g) => g.id === id)?.name ?? '?') : '행사 기본');
  const initialGroup = defaultGroupId && groups.some((g) => g.id === defaultGroupId) ? defaultGroupId : '';

  // 단가 폼 상태 (제어형 — 확인창에 변경 전/후를 보여주기 위해)
  const [rGroup, setRGroup] = useState(initialGroup);
  const [rMode, setRMode] = useState<Mode>('online');
  const [rPrice, setRPrice] = useState('');
  const [rCap, setRCap] = useState('');
  const [rFrom, setRFrom] = useState(today);
  // 한도 폼 상태
  const [lGroup, setLGroup] = useState(initialGroup);
  const [lMentor, setLMentor] = useState('');
  const [lCase, setLCase] = useState('');
  const [lFrom, setLFrom] = useState(today);
  const dirty = !!(rPrice || rCap || lMentor || lCase);
  useUnsavedGuard(dirty);

  const run = (fn: () => Promise<{ ok: true; id?: string } | { ok: false; error: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? { title: ok } : { title: r.error, variant: 'destructive' });
      if (r.ok) after?.();
    });

  /** 현재 적용 표 — 행사 기본 + 각 그룹 × 온/오프 */
  const applied = useMemo(() => {
    const scopes: { id: string | null; name: string }[] = [{ id: null, name: '행사 기본' }, ...groups];
    return scopes.map((sc) => {
      const modes = (['online', 'offline'] as Mode[]).map((mode) => {
        const own = currentOf(rates, sc.id, today, (r) => r.mode === mode);
        const base = sc.id ? currentOf(rates, null, today, (r) => r.mode === mode) : null;
        const row = own ?? base;
        return { mode, row, inherited: !own && !!base };
      });
      const ownLimit = currentOf(limits, sc.id, today);
      const baseLimit = sc.id ? currentOf(limits, null, today) : null;
      return { scope: sc, modes, limit: ownLimit ?? baseLimit, limitInherited: !ownLimit && !!baseLimit };
    });
  }, [rates, limits, groups, today]);

  const submitRate = async () => {
    const gid = rGroup || null;
    const before = currentOf(rates, gid, today, (r) => r.mode === rMode) ?? (gid ? currentOf(rates, null, today, (r) => r.mode === rMode) : null);
    const price = Number(rPrice || 0);
    const cap = Number(rCap || 0);
    const ok = await confirm({
      title: '단가 추가',
      description: `${groupName(gid)} · ${MODE_LABEL[rMode]} · ${rFrom} 부터 적용`,
      impact: [
        `단가: ${before ? formatKRW(Number(before.unit_price)) : '(없음)'} → ${formatKRW(price)}`,
        `일일 상한: ${before ? formatKRW(Number(before.daily_cap_amount)) : '(없음)'} → ${formatKRW(cap)}`,
        before && before.support_type_id !== gid ? '현재는 행사 기본값을 따르고 있어, 이 그룹만 별도 값으로 바뀝니다.' : '적용일 이후 등록되는 회차부터 반영되며 과거 회차 스냅샷은 바뀌지 않습니다.',
      ],
      confirmLabel: '추가',
    });
    if (!ok) return;
    run(() => addRateAction({ support_type_id: rGroup, mode: rMode, unit_price: rPrice, daily_cap_amount: rCap, effective_from: rFrom }), '단가를 추가했습니다.', () => {
      setRPrice('');
      setRCap('');
    });
  };

  const submitLimit = async () => {
    const gid = lGroup || null;
    const before = currentOf(limits, gid, today) ?? (gid ? currentOf(limits, null, today) : null);
    const ok = await confirm({
      title: '운영 한도 추가',
      description: `${groupName(gid)} · ${lFrom} 부터 적용`,
      impact: [
        `멘토 1일 최대 건수: ${before ? before.mentor_daily_case_limit : '(없음)'} → ${lMentor || '?'}`,
        `멘티 1일 최대 회차: ${before ? before.case_daily_round_limit : '(없음)'} → ${lCase || '?'}`,
        '적용일 이후 등록되는 회차부터 검증에 반영됩니다.',
      ],
      confirmLabel: '추가',
    });
    if (!ok) return;
    run(() => addLimitAction({ support_type_id: lGroup, mentor_daily_case_limit: lMentor, case_daily_round_limit: lCase, effective_from: lFrom }), '한도를 추가했습니다.', () => {
      setLMentor('');
      setLCase('');
    });
  };

  const selectCls = 'h-9 rounded-md border bg-background px-2 text-sm';

  return (
    <div className="flex flex-col gap-6">
      {dialog}

      {/* 현재 적용 요약 */}
      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">현재 적용 중 ({today} 기준)</h3>
        <p className="text-xs text-muted-foreground">그룹 행이 없으면 행사 기본값을 따릅니다. 배지로 구분: <span className="rounded bg-muted px-1">행사 기본</span> / <span className="rounded bg-violet-100 px-1 text-violet-800">그룹 지정</span></p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2">범위</th>
                <th className="py-1 pr-2">온라인 단가 / 일일 상한</th>
                <th className="py-1 pr-2">오프라인 단가 / 일일 상한</th>
                <th className="py-1 pr-2">멘토 1일 건수 · 멘티 1일 회차</th>
              </tr>
            </thead>
            <tbody>
              {applied.map((a) => (
                <tr key={a.scope.id ?? 'base'} className="border-b last:border-0">
                  <td className="py-1.5 pr-2 font-medium">{a.scope.name}</td>
                  {a.modes.map((m) => (
                    <td key={m.mode} className="py-1.5 pr-2 tabular-nums">
                      {m.row ? (
                        <>
                          {formatKRW(Number(m.row.unit_price))} / {formatKRW(Number(m.row.daily_cap_amount))}
                          <ScopeBadge inherited={m.inherited} isBase={a.scope.id === null} />
                        </>
                      ) : (
                        <span className="text-status-rejected">미설정</span>
                      )}
                    </td>
                  ))}
                  <td className="py-1.5 pr-2 tabular-nums">
                    {a.limit ? (
                      <>
                        {a.limit.mentor_daily_case_limit}건 · {a.limit.case_daily_round_limit}회
                        <ScopeBadge inherited={a.limitInherited} isBase={a.scope.id === null} />
                      </>
                    ) : (
                      <span className="text-status-rejected">미설정</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-background p-4">
        <h3 className="font-semibold">컨설팅 단가 · 일일 금액 상한</h3>
        <p className="text-xs text-muted-foreground">유형별 단가(회당)와 같은 멘티·같은 날 합산 상한. 그룹 override 는 그룹을 고르세요. 적용일 이후 등록되는 회차부터 반영됩니다.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitRate();
          }}
          className="mt-3 grid gap-2 sm:grid-cols-6"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="rate-group" className="text-xs">범위</Label>
            <select id="rate-group" value={rGroup} onChange={(e) => setRGroup(e.target.value)} className={selectCls}>
              <option value="">행사 기본</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rate-mode" className="text-xs">유형</Label>
            <select id="rate-mode" value={rMode} onChange={(e) => setRMode(e.target.value as Mode)} className={selectCls}>
              <option value="online">온라인</option>
              <option value="offline">오프라인</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rate-price" className="text-xs">단가 (회당)</Label>
            <AmountInput id="rate-price" value={rPrice} onValueChange={setRPrice} placeholder="80,000" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rate-cap" className="text-xs">일일 상한 (멘티·일)</Label>
            <AmountInput id="rate-cap" value={rCap} onValueChange={setRCap} placeholder="240,000" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="rate-from" className="text-xs">적용일</Label>
            <Input id="rate-from" type="date" value={rFrom} onChange={(e) => setRFrom(e.target.value)} required />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={pending || !rPrice || !rCap || !rFrom} className="w-full">추가</Button>
          </div>
        </form>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1">범위</th><th className="py-1">유형</th><th className="py-1 text-right">단가</th><th className="py-1 text-right">일일 상한</th><th className="py-1">적용일</th><th />
            </tr>
          </thead>
          <tbody>
            {rates.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-xs text-muted-foreground">단가 이력이 없습니다. 위에서 행사 기본 단가를 먼저 추가하세요.</td></tr>}
            {rates.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-1">{groupName(r.support_type_id)}</td>
                <td className="py-1">{MODE_LABEL[r.mode as Mode] ?? r.mode}</td>
                <td className="py-1 text-right tabular-nums">{formatKRW(Number(r.unit_price))}</td>
                <td className="py-1 text-right tabular-nums">{formatKRW(Number(r.daily_cap_amount))}</td>
                <td className="py-1 tabular-nums">{r.effective_from}{r.effective_from > today && <span className="ml-1 text-xs text-amber-700">예정</span>}</td>
                <td className="py-1 text-right">
                  {r.effective_from > today && (
                    <Button size="sm" variant="ghost" disabled={pending} aria-label={`${groupName(r.support_type_id)} ${MODE_LABEL[r.mode as Mode]} ${r.effective_from} 예정 단가 삭제`} onClick={() => void (async () => { if (await confirm({ title: '예정 단가 삭제', description: `${groupName(r.support_type_id)} · ${MODE_LABEL[r.mode as Mode]} · ${r.effective_from} 예정 행을 삭제합니다.`, confirmLabel: '삭제', severity: 'danger' })) run(() => deleteFutureRowAction('consulting_rates', r.id), '삭제했습니다.'); })()}>
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitLimit();
          }}
          className="mt-3 grid gap-2 sm:grid-cols-5"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="limit-group" className="text-xs">범위</Label>
            <select id="limit-group" value={lGroup} onChange={(e) => setLGroup(e.target.value)} className={selectCls}>
              <option value="">행사 기본</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="limit-mentor" className="text-xs">멘토 1일 최대 건수</Label>
            <Input id="limit-mentor" type="number" min={1} max={50} value={lMentor} onChange={(e) => setLMentor(e.target.value)} placeholder="3" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="limit-case" className="text-xs">멘티 1일 최대 회차</Label>
            <Input id="limit-case" type="number" min={1} max={20} value={lCase} onChange={(e) => setLCase(e.target.value)} placeholder="3" required />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="limit-from" className="text-xs">적용일</Label>
            <Input id="limit-from" type="date" value={lFrom} onChange={(e) => setLFrom(e.target.value)} required />
          </div>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={pending || !lMentor || !lCase || !lFrom} className="w-full">추가</Button>
          </div>
        </form>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1">범위</th><th className="py-1 text-right">멘토 1일 건수</th><th className="py-1 text-right">멘티 1일 회차</th><th className="py-1">적용일</th><th />
            </tr>
          </thead>
          <tbody>
            {limits.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-xs text-muted-foreground">한도 이력이 없습니다.</td></tr>}
            {limits.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-1">{groupName(r.support_type_id)}</td>
                <td className="py-1 text-right tabular-nums">{r.mentor_daily_case_limit}</td>
                <td className="py-1 text-right tabular-nums">{r.case_daily_round_limit}</td>
                <td className="py-1 tabular-nums">{r.effective_from}{r.effective_from > today && <span className="ml-1 text-xs text-amber-700">예정</span>}</td>
                <td className="py-1 text-right">
                  {r.effective_from > today && (
                    <Button size="sm" variant="ghost" disabled={pending} aria-label={`${groupName(r.support_type_id)} ${r.effective_from} 예정 한도 삭제`} onClick={() => void (async () => { if (await confirm({ title: '예정 한도 삭제', description: `${groupName(r.support_type_id)} · ${r.effective_from} 예정 행을 삭제합니다.`, confirmLabel: '삭제', severity: 'danger' })) run(() => deleteFutureRowAction('operating_limits', r.id), '삭제했습니다.'); })()}>
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

function ScopeBadge({ inherited, isBase }: { inherited: boolean; isBase: boolean }) {
  if (isBase) return null;
  return <span className={cn('ml-1.5 rounded px-1 text-[10px] font-semibold', inherited ? 'bg-muted text-muted-foreground' : 'bg-violet-100 text-violet-800')}>{inherited ? '행사 기본' : '그룹 지정'}</span>;
}
