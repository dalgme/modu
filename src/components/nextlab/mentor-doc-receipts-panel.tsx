'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';

import { setMentorDocReceiptAction, setMentorDocReceiptsBulkAction } from '@/lib/mentor-docs/actions';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ExcelButton } from '@/components/common/excel-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/** 서버(listMentorDocStatus)에서 내려오는 직렬화 가능한 현황 (P32) */
export interface MentorDocReceiptsSection {
  scope: { supportTypeId: string | null; name: string };
  enabled: boolean;
  items: { key: string; name: string }[];
  mentors: {
    mentorId: string;
    name: string;
    items: { key: string; name: string; received: boolean; receivedAt: string | null; receivedBy: string | null; note: string | null }[];
    receivedCount: number;
    total: number;
  }[];
}

function SectionTable({ section, canEdit }: { section: MentorDocReceiptsSection; canEdit: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const scopeId = section.scope.supportTypeId;

  const toggle = (mentorId: string, itemKey: string, received: boolean) => {
    const id = `${mentorId}|${itemKey}`;
    setBusy(id);
    start(async () => {
      try {
        const r = await setMentorDocReceiptAction({ mentorId, supportTypeId: scopeId, itemKey, received });
        if (!r.ok) toast({ title: r.error, variant: 'destructive' });
        else router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const bulk = async (received: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return toast({ title: '멘토를 먼저 선택하세요.', variant: 'destructive' });
    const names = section.mentors.filter((m) => selected.has(m.mentorId)).map((m) => m.name);
    const ok = await confirm({
      title: received ? `선택한 멘토 ${ids.length}명의 서류 ${section.items.length}종을 전부 수령 처리할까요?` : `선택한 멘토 ${ids.length}명의 수령 체크를 전부 해제할까요?`,
      description: `${section.scope.name} · ${section.items.map((i) => i.name).join(', ')}`,
      impact: names.slice(0, 12).concat(names.length > 12 ? [`외 ${names.length - 12}명`] : []),
      severity: received ? 'normal' : 'danger',
      confirmLabel: received ? '전부 수령' : '전부 해제',
    });
    if (!ok) return;
    start(async () => {
      const r = await setMentorDocReceiptsBulkAction({ mentorIds: ids, supportTypeId: scopeId, itemKeys: section.items.map((i) => i.key), received });
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: r.message ?? '처리했습니다.' });
      setSelected(new Set());
      router.refresh();
    });
  };

  const allSelected = section.mentors.length > 0 && section.mentors.every((m) => selected.has(m.mentorId));
  const total = section.mentors.length;

  return (
    <div className="flex flex-col gap-2">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold">{section.scope.name}</span>
          <span className="text-xs text-muted-foreground">멘토 {total}명</span>
          {section.items.map((it) => {
            const done = section.mentors.filter((m) => m.items.find((x) => x.key === it.key)?.received).length;
            const complete = total > 0 && done === total;
            return (
              <span key={it.key} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs', complete ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800')}>
                {it.name} <b className="tabular-nums">{done}/{total}</b> 수령
              </span>
            );
          })}
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">선택 {selected.size}명</span>
            <Button type="button" size="sm" variant="outline" className="h-8" disabled={pending || selected.size === 0} onClick={() => bulk(true)}>선택 멘토 전부 수령</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 text-muted-foreground" disabled={pending || selected.size === 0} onClick={() => bulk(false)}>해제</Button>
          </div>
        )}
      </div>
      {total === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">이 범위에 멘토가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                {canEdit && (
                  <th className="w-8 px-2 py-2">
                    <input type="checkbox" checked={allSelected} aria-label="전체 선택" onChange={(e) => setSelected(e.target.checked ? new Set(section.mentors.map((m) => m.mentorId)) : new Set())} />
                  </th>
                )}
                <th className="px-3 py-2 font-medium">멘토</th>
                {section.items.map((it) => (
                  <th key={it.key} className="px-2 py-2 text-center font-medium">{it.name}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium">수령</th>
              </tr>
            </thead>
            <tbody>
              {section.mentors.map((m) => (
                <tr key={m.mentorId} className="border-b last:border-0 hover:bg-accent/30">
                  {canEdit && (
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(m.mentorId)}
                        aria-label={`${m.name} 선택`}
                        onChange={(e) => setSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(m.mentorId); else n.delete(m.mentorId); return n; })}
                      />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-1.5 font-medium">{m.name}</td>
                  {m.items.map((it) => {
                    const id = `${m.mentorId}|${it.key}`;
                    const title = it.received ? `수령 ${it.receivedAt ? formatDate(it.receivedAt) : ''}${it.receivedBy ? ` · ${it.receivedBy}` : ''}${it.note ? ` · ${it.note}` : ''}` : '미수령 — 누르면 수령 처리';
                    return (
                      <td key={it.key} className="px-2 py-1 text-center">
                        <button
                          type="button"
                          title={title}
                          disabled={!canEdit || (pending && busy === id)}
                          onClick={() => canEdit && toggle(m.mentorId, it.key, !it.received)}
                          className={cn(
                            'inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-xs font-bold tabular-nums transition-colors sm:h-7 sm:min-w-7',
                            it.received ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-muted-foreground/30 text-muted-foreground',
                            canEdit ? 'hover:border-primary' : 'cursor-default',
                            pending && busy === id && 'opacity-50',
                          )}
                        >
                          {it.received ? 'O' : '–'}
                        </button>
                      </td>
                    );
                  })}
                  <td className={cn('px-3 py-1.5 text-right tabular-nums', m.receivedCount === m.total ? 'font-semibold text-emerald-700' : 'text-muted-foreground')}>
                    {m.receivedCount}/{m.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * 서류 수령 현황 카드 (멘토 명단 상단, P32) — 오프라인으로 받은 멘토 서류의 수령 사실을 O/– 로 체크한다.
 * 행사 전체 범위에서 그룹별 목록이 갈리면 섹션을 나눠 보여준다('그룹별 상이').
 */
export function MentorDocReceiptsPanel({ sections, mixed, canEdit, exportHref }: { sections: MentorDocReceiptsSection[]; mixed: boolean; canEdit: boolean; exportHref: string }) {
  const [open, setOpen] = useState(true);
  const active = sections.filter((s) => s.enabled);
  if (active.length === 0) return null;
  const mentorTotal = active.reduce((n, s) => n + s.mentors.length, 0);
  const allDone = active.reduce((n, s) => n + s.mentors.filter((m) => m.total > 0 && m.receivedCount === m.total).length, 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4" /> 서류 수령 현황
            <span className="text-xs font-normal text-muted-foreground">전부 수령 {allDone}/{mentorTotal}명</span>
            {mixed && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">그룹별 상이</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <ExcelButton href={exportHref} label="수령 현황 엑셀" title="현재 범위의 멘토 × 서류 수령 현황" />
            <button type="button" className="text-xs text-primary underline" onClick={() => setOpen((v) => !v)}>
              {open ? '접기' : '펼치기'}
            </button>
          </div>
        </div>
        <CardDescription className="text-xs">
          오프라인(이메일·서면)으로 받은 서류의 수령 사실을 체크합니다. O = 수령, – = 미수령. 서류명·사용 여부는{' '}
          <a href="/nextlab/settings?tab=mentor-docs" className="text-primary underline">운영 설정 → 멘토 서류 수령</a>에서 바꿉니다.
          {mixed && ' 그룹별로 다른 목록을 쓰고 있어 범위(그룹)별로 나눠 표시합니다.'}
          {!canEdit && ' (열람 전용 — 수령 체크는 멘토 지급서류 권한이 필요합니다)'}
        </CardDescription>
      </CardHeader>
      {open && (
        <CardContent className="flex flex-col gap-5">
          {active.map((s) => (
            <SectionTable key={s.scope.supportTypeId ?? 'common'} section={s} canEdit={canEdit} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}
