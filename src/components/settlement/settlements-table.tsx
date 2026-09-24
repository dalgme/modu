'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Coins, FolderPlus, Search } from 'lucide-react';

import type { SettlementItem } from '@/lib/data/settlements';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { addToBatchAction, createBatchAction } from '@/lib/settlement/actions';
import { StatusBadge } from '@/components/cases/status-badge';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ListToolbar } from '@/components/common/list-toolbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatKRW } from '@/lib/utils/format';

/**
 * 정산 건 목록 + 체크박스 선택 → 새 품의 생성 또는 기존 draft 품의에 추가.
 * selectable=false 면 열람 전용. 툴바(멘토명 검색 · 그룹 칩)는 클라이언트 필터.
 * 품의 편성 시 "서류 미비" 멘토가 섞여 있으면 확인창에서 경고한다.
 */
export function SettlementsTable({
  items,
  selectable = false,
  draftBatches = [],
  caseHrefBase,
  batchHrefBase,
  batchQuery = '',
  showToolbar = true,
  emptyHint,
}: {
  items: SettlementItem[];
  selectable?: boolean;
  draftBatches?: { id: string; title: string }[];
  caseHrefBase: string;
  batchHrefBase?: string;
  /** 품의 링크에 붙일 쿼리 (예: `?tab=all`) — 상세에서 돌아올 때 탭 유지 */
  batchQuery?: string;
  showToolbar?: boolean;
  emptyHint?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState<string>('new');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of items) m.set(s.supportTypeName ?? '(그룹 없음)', (m.get(s.supportTypeName ?? '(그룹 없음)') ?? 0) + 1);
    return Array.from(m.entries()).map(([name, count]) => ({ key: name, label: name, count }));
  }, [items]);
  const filtered = useMemo(() => {
    const q = query.trim();
    return items.filter((s) => (group === 'all' || (s.supportTypeName ?? '(그룹 없음)') === group) && (!q || s.mentorName.includes(q) || s.businessName.includes(q) || s.ownerName.includes(q)));
  }, [items, query, group]);

  const selectedItems = useMemo(() => items.filter((s) => selected.has(s.id)), [items, selected]);
  const total = selectedItems.reduce((acc, s) => ({ gross: acc.gross + Number(s.gross), withholding: acc.withholding + Number(s.withholding), net: acc.net + Number(s.net) }), { gross: 0, withholding: 0, net: 0 });
  const allSelectable = filtered.filter((s) => s.status === 'pending');
  const docsMissing = selectedItems.filter((s) => s.mentorDocsMissing);
  const docsMissingNames = Array.from(new Set(docsMissing.map((s) => s.mentorName)));

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
      setConfirmOpen(false);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: `${ids.length}건을 품의에 편성했습니다.` });
      setSelected(new Set());
      setTitle('');
      if (batchHrefBase) router.push(`${batchHrefBase}/${r.batchId}${batchQuery}`);
    });
  };
  const targetTitle = target === 'new' ? title.trim() : (draftBatches.find((b) => b.id === target)?.title ?? '');

  return (
    <div className="flex flex-col gap-3">
      {showToolbar && items.length > 0 && (
        <ListToolbar
          summary={<>정산 건 <b>{items.length}</b>{filtered.length !== items.length ? <span className="text-muted-foreground"> · 표시 {filtered.length}</span> : null}</>}
          query={query}
          onQuery={setQuery}
          placeholder="멘토명 · 멘티 검색"
          filters={groups.length > 1 ? [{ key: 'all', label: '전체 그룹', count: items.length }, ...groups] : undefined}
          active={group}
          onFilter={setGroup}
        />
      )}
      {selectable && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-background p-3">
          <div className="text-sm">
            선택 <b>{selected.size}</b>건 · 지급총액 <b className="tabular-nums">{formatKRW(total.gross)}</b> · 원천징수 <span className="tabular-nums">{formatKRW(total.withholding)}</span> · 실지급{' '}
            <b className="tabular-nums text-primary">{formatKRW(total.net)}</b>
            {docsMissing.length > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">서류 미비 {docsMissingNames.length}명 포함</span>}
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            {draftBatches.length > 0 && (
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" disabled={pending} aria-label="편성 대상 품의">
                <option value="new">새 품의</option>
                {draftBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    기존: {b.title}
                  </option>
                ))}
              </select>
            )}
            {target === 'new' && <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="품의 제목 (예: 2026-10 1차 지급 품의)" aria-label="품의 제목" className="w-64" disabled={pending} />}
            <Button onClick={() => setConfirmOpen(true)} disabled={pending || selected.size === 0 || (target === 'new' && !title.trim())} className="gap-1">
              <FolderPlus className="h-4 w-4" /> 품의 편성
            </Button>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState icon={Coins} title="정산 건이 없습니다" hint={emptyHint ?? '케이스 상세에서 종결 검수를 승인하면 정산이 확정되어 여기에 지급 대기로 나타납니다.'} />
      ) : (
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
                <th className="hidden px-3 py-2 md:table-cell">그룹</th>
                <th className="hidden px-3 py-2 md:table-cell">구분</th>
                <th className="px-3 py-2 text-right">회차</th>
                <th className="px-3 py-2 text-right">지급총액</th>
                <th className="hidden px-3 py-2 text-right md:table-cell">원천징수</th>
                <th className="px-3 py-2 text-right">실지급</th>
                <th className="px-3 py-2">상태</th>
                <th className="hidden px-3 py-2 md:table-cell">확정일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={selectable ? 11 : 10} className="px-3 py-4">
                    <EmptyState compact icon={Search} title="조건에 맞는 정산 건이 없습니다" hint="검색어를 지우거나 그룹 필터를 [전체 그룹]으로 바꿔 보세요." action={<button type="button" className="text-xs font-semibold text-primary underline" onClick={() => { setQuery(''); setGroup('all'); }}>초기화</button>} />
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  {selectable && (
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(s.id)} disabled={s.status !== 'pending'} onChange={() => toggle(s.id)} aria-label={`${s.mentorName} · ${s.businessName} 선택`} />
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium">
                    {s.mentorName}
                    {s.mentorDocsMissing && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="이력서·통장사본·신분증사본 중 미수령">서류 미비</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`${caseHrefBase}/${s.case_id}`} className="hover:underline">
                      {s.businessName}
                    </Link>
                    <span className="ml-1 text-xs text-muted-foreground">{s.ownerName}</span>
                  </td>
                  <td className="hidden px-3 py-2 text-xs md:table-cell">{s.supportTypeName ?? '-'}</td>
                  <td className="hidden px-3 py-2 text-xs md:table-cell">
                    {s.kind === 'closure' ? '종결' : '부분'} · {WITHHOLDING_LABELS[s.withholding_method as 'other_income' | 'business_income' | 'none']}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.roundCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(s.gross))}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatKRW(Number(s.withholding))}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(s.net))}</td>
                  <td className="px-3 py-2 text-xs">
                    <StatusBadge kind="settlement" status={s.status} />
                    {s.batchTitle && batchHrefBase && s.batch_id && (
                      <Link href={`${batchHrefBase}/${s.batch_id}${batchQuery}`} className="ml-1 text-primary hover:underline">
                        {s.batchTitle}
                      </Link>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 text-xs tabular-nums md:table-cell">{formatDate(s.confirmed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={target === 'new' ? '새 품의 편성' : '기존 품의에 추가'}
        description={target === 'new' ? `"${targetTitle}" 품의를 만들고 선택한 정산 건을 편성합니다.` : `"${targetTitle}" 품의에 선택한 정산 건을 추가합니다.`}
        impact={[
          `${selected.size}건 · 지급총액 ${formatKRW(total.gross)} · 원천징수 ${formatKRW(total.withholding)} · 실지급 ${formatKRW(total.net)}`,
          '편성된 케이스는 "지급 품의 편성" 단계로 바뀌고, 발주처 제출 전까지는 품의에서 제외할 수 있습니다.',
          ...(docsMissingNames.length ? [`⚠ 지급서류 미수령 멘토 ${docsMissingNames.length}명 포함: ${docsMissingNames.slice(0, 5).join(', ')}${docsMissingNames.length > 5 ? ` 외 ${docsMissingNames.length - 5}명` : ''} — 제출 전 이력서·통장사본·신분증사본 수령을 확인하세요.`] : []),
        ]}
        confirmLabel={docsMissingNames.length ? '서류 미비를 알고 편성' : '품의 편성'}
        severity={docsMissingNames.length ? 'danger' : 'normal'}
        pending={pending}
        onConfirm={submit}
      />
    </div>
  );
}
