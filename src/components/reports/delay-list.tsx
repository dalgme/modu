'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing } from 'lucide-react';

import type { DelayedCase, DelayKind } from '@/lib/reports/delays';
import { DELAY_LABELS } from '@/lib/reports/delays';
import { sendDelayNudgeAction } from '@/lib/reports/delay-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const MENTOR_KINDS: DelayKind[] = ['no_round', 'stalled', 'revision'];

const KIND_TONE: Record<DelayKind, string> = {
  unassigned: 'bg-muted text-foreground',
  reassign: 'bg-muted text-foreground',
  no_round: 'bg-amber-100 text-amber-900',
  stalled: 'bg-destructive/10 text-destructive',
  revision: 'bg-amber-100 text-amber-900',
};

/** 지연 케이스 목록 (P22) — 운영사는 멘토 책임 지연을 선택해 독려 문자 발송. 발주처는 열람 전용. */
export function DelayList({ items, caseHrefBase, canNudge }: { items: DelayedCase[]; caseHrefBase: string; canNudge: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (items.length === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">지연 케이스가 없습니다. 👍</p>;
  }
  const nudgeable = items.filter((i) => MENTOR_KINDS.includes(i.kind) && i.mentorId);
  const selectedIds = Array.from(selected);

  return (
    <div className="flex flex-col gap-2">
      {canNudge && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted-foreground">
            멘토 책임 지연(첫 회차 없음·장기 무진행·보완 지연)을 선택하면 멘토별로 묶어 독려 문자를 1건씩 보냅니다.
          </span>
          <Button
            size="sm"
            className="ml-auto gap-1"
            disabled={pending || selectedIds.length === 0}
            onClick={() =>
              start(async () => {
                const r = await sendDelayNudgeAction(selectedIds);
                toast(r.ok ? { title: `독려 문자 발송 — 멘토 ${r.sent}명 (실패 ${r.failed} · 제외 ${r.skipped})` } : { title: r.error, variant: 'destructive' });
                if (r.ok) {
                  setSelected(new Set());
                  router.refresh();
                }
              })
            }
          >
            <BellRing className="h-4 w-4" /> 독려 문자 ({selectedIds.length})
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border-2 bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              {canNudge && (
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={nudgeable.length > 0 && nudgeable.every((i) => selected.has(i.caseId))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(nudgeable.map((i) => i.caseId)) : new Set())}
                  />
                </th>
              )}
              <th className="px-3 py-2">멘티 (이름/소속)</th>
              <th className="px-3 py-2">그룹</th>
              <th className="px-3 py-2">지연 종류</th>
              <th className="px-3 py-2 text-right">경과</th>
              <th className="px-3 py-2 text-right">회차</th>
              <th className="px-3 py-2">담당 멘토</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const nudge = MENTOR_KINDS.includes(i.kind) && !!i.mentorId;
              return (
                <tr key={`${i.caseId}-${i.kind}`} className="border-b last:border-0">
                  {canNudge && (
                    <td className="px-3 py-2">
                      {nudge && (
                        <input
                          type="checkbox"
                          checked={selected.has(i.caseId)}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(i.caseId)) next.delete(i.caseId);
                              else next.add(i.caseId);
                              return next;
                            })
                          }
                          aria-label={`${i.ownerName} 선택`}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium">
                    <Link href={`${caseHrefBase}/${i.caseId}`} className="hover:underline">
                      {i.ownerName}<span className="font-normal text-muted-foreground">/{i.businessName}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{i.groupName ?? '-'}</td>
                  <td className="px-3 py-2">
                    <Badge className={`text-[10px] font-semibold ${KIND_TONE[i.kind]}`} variant="outline">{DELAY_LABELS[i.kind]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-destructive">{i.days}일</td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.roundsDone}/{i.requiredRounds}</td>
                  <td className="px-3 py-2 text-xs">{i.mentorName ?? <span className="text-muted-foreground">미배정</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
