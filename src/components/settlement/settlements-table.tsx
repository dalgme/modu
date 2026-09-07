'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderPlus } from 'lucide-react';

import type { SettlementItem } from '@/lib/data/settlements';
import { SETTLEMENT_STATUS_LABELS } from '@/lib/settlement/labels';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { addToBatchAction, createBatchAction } from '@/lib/settlement/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatKRW } from '@/lib/utils/format';

/**
 * 정산 건 목록 + 체크박스 선택 → 새 품의 생성 또는 기존 draft 품의에 추가.
 * selectable=false 면 열람 전용.
 */
export function SettlementsTable({
  items,
  selectable = false,
  draftBatches = [],
  caseHrefBase,
  batchHrefBase,
}: {
  items: SettlementItem[];
  selectable?: boolean;
  draftBatches?: { id: string; title: string }[];
  caseHrefBase: string;
  batchHrefBase?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState<string>('new');

  const selectedItems = useMemo(() => items.filter((s) => selected.has(s.id)), [items, selected]);
  const total = selectedItems.reduce((acc, s) => ({ gross: acc.gross + Number(s.gross), withholding: acc.withholding + Number(s.withholding), net: acc.net + Number(s.net) }), { gross: 0, withholding: 0, net: 0 });
  const allSelectable = items.filter((s) => s.status === 'pending');

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const submit = () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    start(async () => {
      const r = target === 'new' ? await createBatchAction(title, ids) : await addToBatchAction(target, ids);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: `${ids.length}건을 품의에 편성했습니다.` });
      setSelected(new Set());
      setTitle('');
      if (batchHrefBase) router.push(`${batchHrefBase}/${r.batchId}`);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {selectable && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-background p-3">
          <div className="text-sm">
            선택 <b>{selected.size}</b>건 · 지급총액 <b className="tabular-nums">{formatKRW(total.gross)}</b> · 원천징수 <span className="tabular-nums">{formatKRW(total.withholding)}</span> · 실지급{' '}
            <b className="tabular-nums text-primary">{formatKRW(total.net)}</b>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            {draftBatches.length > 0 && (
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" disabled={pending}>
                <option value="new">새 품의</option>
                {draftBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    기존: {b.title}
                  </option>
                ))}
              </select>
            )}
            {target === 'new' && <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="품의 제목 (예: 2026-10 1차 지급 품의)" className="w-64" disabled={pending} />}
            <Button onClick={submit} disabled={pending || selected.size === 0 || (target === 'new' && !title.trim())} className="gap-1">
              <FolderPlus className="h-4 w-4" /> 품의 편성
            </Button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              {selectable && (
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={allSelectable.length > 0 && allSelectable.every((s) => selected.has(s.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(allSelectable.map((s) => s.id)) : new Set())}
                  />
                </th>
              )}
              <th className="px-3 py-2">멘토</th>
              <th className="px-3 py-2">멘티(기업·팀)</th>
              <th className="px-3 py-2">그룹</th>
              <th className="px-3 py-2">구분</th>
              <th className="px-3 py-2 text-right">회차</th>
              <th className="px-3 py-2 text-right">지급총액</th>
              <th className="px-3 py-2 text-right">원천징수</th>
              <th className="px-3 py-2 text-right">실지급</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">확정일</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={selectable ? 11 : 10} className="px-3 py-6 text-center text-muted-foreground">
                  정산 건이 없습니다.
                </td>
              </tr>
            )}
            {items.map((s) => (
              <tr key={s.id} className="border-b last:border-0">
                {selectable && (
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={selected.has(s.id)} disabled={s.status !== 'pending'} onChange={() => toggle(s.id)} aria-label="선택" />
                  </td>
                )}
                <td className="px-3 py-2 font-medium">{s.mentorName}</td>
                <td className="px-3 py-2">
                  <Link href={`${caseHrefBase}/${s.case_id}`} className="hover:underline">
                    {s.businessName}
                  </Link>
                  <span className="ml-1 text-xs text-muted-foreground">{s.ownerName}</span>
                </td>
                <td className="px-3 py-2 text-xs">{s.supportTypeName ?? '-'}</td>
                <td className="px-3 py-2 text-xs">
                  {s.kind === 'closure' ? '종결' : '부분'} · {WITHHOLDING_LABELS[s.withholding_method as 'other_income' | 'business_income' | 'none']}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{s.roundCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(s.gross))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(s.withholding))}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(s.net))}</td>
                <td className="px-3 py-2 text-xs">
                  {SETTLEMENT_STATUS_LABELS[s.status] ?? s.status}
                  {s.batchTitle && batchHrefBase && s.batch_id && (
                    <Link href={`${batchHrefBase}/${s.batch_id}`} className="ml-1 text-primary hover:underline">
                      {s.batchTitle}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums">{formatDate(s.confirmed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
