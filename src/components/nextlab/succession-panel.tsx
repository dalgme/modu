'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { menteeLabel } from '@/lib/utils/labels';
import type { CaseListItem } from '@/lib/data/cases';
import type { SuccessionResult } from '@/lib/workflow/succession';
import { succeedCasesV2Action } from '@/lib/workflow/succession-actions';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export type SuccessionMode = 'succession' | 'relocation';
export type SuccessionFilter = 'completed' | 'all' | 'withdrawn';

/** 승계 원천 필터 칩 — 서버(설정 페이지)와 화면이 같은 상수를 읽는다 */
export const SUCCESSION_FILTERS: { key: SuccessionFilter; label: string; statuses: CaseStatus[] | null }[] = [
  { key: 'completed', label: '수료', statuses: ['settlement_pending', 'settlement_batched', 'closed'] },
  { key: 'all', label: '전체', statuses: null },
  { key: 'withdrawn', label: '중도 종료', statuses: ['withdrawn'] },
];

export interface SuccessorInfo {
  caseId: string;
  supportTypeName: string | null;
  status: CaseStatus;
}

/**
 * 승계 개설 (P30) — [승계 | 재배치(탈락자)] 모드, 원천 그룹·상태 칩, 이미 승계된 케이스 배지, [같은 멘토 유지]·[필수서류 승계] 옵션 → 일괄 개설.
 * 재배치 모드는 행사 전체의 중도 종료 케이스를 새 그룹에 다시 등록한다(멘토 유지 없음 → 자동 매칭).
 */
export function SuccessionPanel({
  groups,
  sourceGroupId,
  cases,
  successors,
  mode,
  filter,
}: {
  groups: { id: string; name: string; code: string; status: string; predecessor_support_type_id: string | null }[];
  sourceGroupId: string;
  cases: CaseListItem[];
  /** 원천 케이스 id → 승계 케이스 */
  successors: Record<string, SuccessorInfo>;
  mode: SuccessionMode;
  filter: SuccessionFilter;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const defaultTarget = mode === 'succession' ? (groups.find((g) => g.predecessor_support_type_id === sourceGroupId && g.status === 'active')?.id ?? '') : '';
  const [target, setTarget] = useState(defaultTarget);
  const [keepMentor, setKeepMentor] = useState(true);
  const [copyDocs, setCopyDocs] = useState(true);
  const [result, setResult] = useState<SuccessionResult | null>(null);

  const go = (next: { mode?: SuccessionMode; filter?: SuccessionFilter; source?: string }) => {
    const q = new URLSearchParams({ tab: 'succession', mode: next.mode ?? mode, filter: next.filter ?? filter, source: next.source ?? sourceGroupId });
    setSelected(new Set());
    router.push(`/nextlab/settings?${q.toString()}`);
  };

  const selectable = cases.filter((c) => !successors[c.id]);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const submit = () => {
    if (!target || selected.size === 0) return;
    const targetName = groups.find((g) => g.id === target)?.name ?? '';
    const msg = mode === 'relocation'
      ? `${selected.size}건을 ${targetName} 그룹에 재배치 등록할까요? 새 케이스가 만들어지고(이전 케이스 연결), 멘토는 자동 매칭(희망 멘토·추천)으로 정합니다.`
      : `${selected.size}건을 ${targetName} 그룹으로 승계 개설할까요? 새 케이스가 만들어지고 이전 케이스는 그대로 보존됩니다.${keepMentor ? ' 같은 멘토를 자동 배정합니다(정원·지정 규칙 검사).' : ''}`;
    if (!confirm(msg)) return;
    start(async () => {
      const r = await succeedCasesV2Action({ sourceCaseIds: Array.from(selected), targetGroupId: target, keepMentor: mode === 'succession' && keepMentor, copyRequiredDocs: copyDocs, kind: mode });
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      setResult(r.result);
      setSelected(new Set());
      toast({ title: `개설 ${r.result.created.length}건 · 건너뜀 ${r.result.skipped.length}건` });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 모드 스위치 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {([
          { key: 'succession', label: '승계 (다음 단계 그룹으로)' },
          { key: 'relocation', label: '재배치 (중도 종료 · 탈락자)' },
        ] as { key: SuccessionMode; label: string }[]).map((m) => (
          <button key={m.key} type="button" onClick={() => go({ mode: m.key, filter: m.key === 'relocation' ? 'withdrawn' : 'completed' })} className={`rounded-full px-3 py-1 text-xs font-semibold ${mode === m.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
            {m.label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">{mode === 'relocation' ? '행사 전체의 중도 종료 케이스를 새 그룹에 다시 등록합니다. 멘토는 유지되지 않고 자동 매칭됩니다.' : '이전 그룹의 멘티를 다음 그룹으로 이어갑니다. 프로필·팀원·등록 메모·필수서류(옵션)를 복사합니다.'}</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4 text-sm">
        {mode === 'succession' && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">원천 그룹</span>
              <select value={sourceGroupId} onChange={(e) => go({ source: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.code} · {g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">상태</span>
              <div className="flex gap-1">
                {SUCCESSION_FILTERS.map((f) => (
                  <button key={f.key} type="button" onClick={() => go({ filter: f.key })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <span className="pb-2 text-muted-foreground">→</span>
          </>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">대상 그룹 (활성)</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">선택</option>
            {groups.filter((g) => g.status === 'active' && (mode === 'relocation' || g.id !== sourceGroupId)).map((g) => (
              <option key={g.id} value={g.id}>{g.code} · {g.name}{mode === 'succession' && g.predecessor_support_type_id === sourceGroupId ? ' (승계 원천 지정됨)' : ''}</option>
            ))}
          </select>
        </div>
        {mode === 'succession' && (
          <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={keepMentor} onChange={(e) => setKeepMentor(e.target.checked)} /> 같은 멘토 유지(자동 배정)</label>
        )}
        <label className="flex items-center gap-2 pb-2" title="대상 그룹 필수서류 슬롯과 키가 같은 이전 케이스 서류를 복사합니다"><input type="checkbox" checked={copyDocs} onChange={(e) => setCopyDocs(e.target.checked)} /> 필수서류 승계</label>
        <Button onClick={submit} disabled={pending || !target || selected.size === 0} className="ml-auto">
          {pending ? '개설 중…' : `선택 ${selected.size}건 ${mode === 'relocation' ? '재배치 등록' : '승계 개설'}`}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2"><input type="checkbox" aria-label="전체" checked={selectable.length > 0 && selectable.every((c) => selected.has(c.id))} onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((c) => c.id)) : new Set())} /></th>
              <th className="px-3 py-2">멘티</th>
              {mode === 'relocation' && <th className="px-3 py-2">그룹</th>}
              <th className="px-3 py-2">연락처</th><th className="px-3 py-2">멘토</th><th className="px-3 py-2">상태</th><th className="px-3 py-2 text-right">회차</th><th className="px-3 py-2">승계</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">{mode === 'relocation' ? '중도 종료된 케이스가 없습니다.' : '조건에 맞는 케이스가 없습니다.'}</td></tr>}
            {cases.map((c) => {
              const succ = successors[c.id];
              return (
                <tr key={c.id} className={`border-b last:border-0 ${succ ? 'text-muted-foreground' : ''}`}>
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label="선택" disabled={!!succ} /></td>
                  <td className="px-3 py-2 font-medium"><Link href={`/nextlab/cases/${c.id}`} className="hover:underline">{menteeLabel(c.owner_name, c.business_name)}</Link></td>
                  {mode === 'relocation' && <td className="px-3 py-2 text-xs">{c.supportTypeName ?? '-'}</td>}
                  <td className="px-3 py-2">{c.phone ?? '-'}</td>
                  <td className="px-3 py-2">{c.mentorName ?? '-'}</td>
                  <td className="px-3 py-2 text-xs">{CASE_STATUS_META[c.status].short}{c.status === 'withdrawn' && c.withdrawn_reason ? <span className="ml-1 text-muted-foreground">({c.withdrawn_reason.slice(0, 20)})</span> : null}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.roundsDone}/{c.requiredRounds}</td>
                  <td className="px-3 py-2 text-xs">
                    {succ ? (
                      <Link href={`/nextlab/cases/${succ.caseId}`} className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 hover:underline">→ {succ.supportTypeName ?? '다음 그룹'} 승계됨</Link>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 text-sm">
          <p className="font-semibold">개설 {result.created.length}건 · 건너뜀 {result.skipped.length}건</p>
          <ul className="mt-1 text-xs">
            {result.created.map((r) => (
              <li key={r.caseId}>
                ✔ {r.businessName} → <Link href={`/nextlab/cases/${r.caseId}`} className="text-primary hover:underline">새 케이스</Link>
                {r.mentorAssigned ? ' (멘토 유지 배정)' : r.autoMatched ? ' (자동 매칭 확정)' : ''}
                {r.docsCopied ? ` · 서류 ${r.docsCopied}건 복사` : ''}
                {r.mentorError && <span className="ml-1 text-destructive">멘토 유지 실패: {r.mentorError}{r.autoMatched ? '' : ' → 미배정(추천 생성)'}</span>}
              </li>
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
