'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { CaseListItem } from '@/lib/data/cases';
import type { SuccessionResult } from '@/lib/workflow/succession';
import { succeedCasesAction } from '@/lib/workflow/case-actions';
import { CASE_STATUS_META } from '@/types/case-status';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/** 승계 개설 — 원천 그룹 케이스 다중 선택 → 대상 그룹 → [같은 멘토 유지] → 일괄 개설 */
export function SuccessionPanel({ groups, sourceGroupId, cases }: { groups: { id: string; name: string; code: string; status: string; predecessor_support_type_id: string | null }[]; sourceGroupId: string; cases: CaseListItem[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const defaultTarget = groups.find((g) => g.predecessor_support_type_id === sourceGroupId && g.status === 'active')?.id ?? '';
  const [target, setTarget] = useState(defaultTarget);
  const [keepMentor, setKeepMentor] = useState(true);
  const [result, setResult] = useState<SuccessionResult | null>(null);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = () => {
    if (!target || selected.size === 0) return;
    if (!confirm(`${selected.size}건을 ${groups.find((g) => g.id === target)?.name ?? ''} 그룹으로 승계 개설할까요? 새 케이스가 만들어지고 이전 케이스는 그대로 보존됩니다.`)) return;
    start(async () => {
      const r = await succeedCasesAction({ sourceCaseIds: Array.from(selected), targetGroupId: target, keepMentor });
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setResult(r.result);
      setSelected(new Set());
      toast({ title: `개설 ${r.result.created.length}건 · 건너뜀 ${r.result.skipped.length}건` });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">원천 그룹</span>
          <select value={sourceGroupId} onChange={(e) => router.push(`/nextlab/succession?source=${e.target.value}`)} className="h-9 rounded-md border bg-background px-2 text-sm">
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.code} · {g.name}</option>
            ))}
          </select>
        </div>
        <span className="pb-2 text-muted-foreground">→</span>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">대상 그룹 (활성)</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">선택</option>
            {groups.filter((g) => g.status === 'active' && g.id !== sourceGroupId).map((g) => (
              <option key={g.id} value={g.id}>{g.code} · {g.name}{g.predecessor_support_type_id === sourceGroupId ? ' (승계 원천 지정됨)' : ''}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={keepMentor} onChange={(e) => setKeepMentor(e.target.checked)} /> 같은 멘토 유지(자동 배정)</label>
        <Button onClick={submit} disabled={pending || !target || selected.size === 0} className="ml-auto">
          {pending ? '개설 중…' : `선택 ${selected.size}건 승계 개설`}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2"><input type="checkbox" aria-label="전체" checked={cases.length > 0 && cases.every((c) => selected.has(c.id))} onChange={(e) => setSelected(e.target.checked ? new Set(cases.map((c) => c.id)) : new Set())} /></th>
              <th className="px-3 py-2">기업(팀)</th><th className="px-3 py-2">멘티</th><th className="px-3 py-2">멘토</th><th className="px-3 py-2">상태</th><th className="px-3 py-2 text-right">회차</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">원천 그룹에 케이스가 없습니다.</td></tr>}
            {cases.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label="선택" /></td>
                <td className="px-3 py-2 font-medium"><Link href={`/nextlab/cases/${c.id}`} className="hover:underline">{c.business_name}</Link></td>
                <td className="px-3 py-2">{c.owner_name}</td>
                <td className="px-3 py-2">{c.mentorName ?? '-'}</td>
                <td className="px-3 py-2 text-xs">{CASE_STATUS_META[c.status].short}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.roundsDone}/{c.requiredRounds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 text-sm">
          <p className="font-semibold">개설 {result.created.length}건 · 건너뜀 {result.skipped.length}건</p>
          <ul className="mt-1 text-xs">
            {result.created.map((r) => (
              <li key={r.caseId}>✔ {r.businessName} → <Link href={`/nextlab/cases/${r.caseId}`} className="text-primary hover:underline">새 케이스</Link>{r.mentorAssigned ? ' (멘토 유지 배정)' : ''}</li>
            ))}
            {result.skipped.map((r) => (
              <li key={r.sourceCaseId} className="text-muted-foreground">– {r.businessName}: {r.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
