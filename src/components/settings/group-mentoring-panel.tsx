'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setGroupMentoringAction } from '@/lib/settings/actions';
import { GROUP_MAX_PER_MENTOR_LIMIT, GROUP_MIN_MENTEES } from '@/lib/workflow/group-mentoring-rule';

export interface GroupMentoringRow {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
  maxPerMentor: number;
  sessions: number;
  mentors: number;
}

/** 운영 설정 > 그룹멘토링 (2026-11-04) — 라운드별 사용 여부 + 멘토 1인당 최대 횟수 */
export function GroupMentoringPanel({ groups, canEdit }: { groups: GroupMentoringRow[]; canEdit: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-xl border border-violet-300 bg-violet-50/60 p-4 text-sm dark:border-violet-800 dark:bg-violet-950/30">
        <h3 className="text-base font-bold">그룹멘토링 운영 방식</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          <li>멘토는 [그룹멘토링] 메뉴에서 <b>자신이 매칭된 멘티 {GROUP_MIN_MENTEES}명 이상</b>을 묶어 일정을 등록합니다.</li>
          <li>참여한 멘티는 각자 <b>1회의 멘토링</b>을 받은 것으로 기록됩니다(멘티별 회차 번호·진행현황·종결 판정에 그대로 반영).</li>
          <li>멘토는 참여 멘티마다 <b>각각 보고서</b>를 작성해 그 멘티의 회차에 올립니다.</li>
          <li>멘토 수당은 그룹멘토링 1회당 <b>1회분</b>(시간당 단가 × 운영시간)만 정산됩니다 — 참여 멘티 중 보고서가 먼저 등록된 회차에 잡히고, 나머지 참여 회차는 0원입니다.</li>
          <li>사용을 끄거나 횟수를 줄여도 이미 등록된 그룹멘토링·보고서·수당은 그대로이며 새 등록만 막힙니다.</li>
        </ul>
      </div>
      <div className="flex flex-col divide-y rounded-lg border bg-background">
        {groups.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">라운드가 없습니다.</p>}
        {groups.map((g) => (
          <Row key={g.id} group={g} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}

function Row({ group, canEdit }: { group: GroupMentoringRow; canEdit: boolean }) {
  const [enabled, setEnabled] = useState(group.enabled);
  const [max, setMax] = useState(String(group.maxPerMentor || 1));
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  const dirty = enabled !== group.enabled || (enabled && Number(max) !== group.maxPerMentor);
  const save = () =>
    start(async () => {
      const r = await setGroupMentoringAction({ groupId: group.id, enabled, maxPerMentor: Number(max) });
      if (r.ok) {
        toast({ title: r.message ?? '저장했습니다.' });
        router.refresh();
      } else toast({ title: r.error, variant: 'destructive' });
    });
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-3">
      <span className="min-w-[140px] text-sm font-medium">
        {group.name}
        {group.status === 'ended' && <span className="ml-1 text-xs font-normal text-muted-foreground">(종료)</span>}
        <span className="block text-[11px] font-normal text-muted-foreground">등록된 그룹멘토링 {group.sessions}회 · 멘토 {group.mentors}명</span>
      </span>
      <div role="radiogroup" aria-label={`${group.name} 그룹멘토링`} className="inline-flex rounded-full border bg-muted p-0.5">
        {[
          { v: true, label: '사용', on: 'bg-violet-600 text-white' },
          { v: false, label: '미사용', on: 'bg-slate-600 text-white' },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={enabled === o.v}
            disabled={pending || !canEdit}
            onClick={() => setEnabled(o.v)}
            className={cn('min-w-[64px] rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-60', enabled === o.v ? o.on : 'text-muted-foreground hover:text-foreground')}
          >
            {o.label}
          </button>
        ))}
      </div>
      <label className={cn('inline-flex items-center gap-1.5 text-sm', !enabled && 'opacity-50')}>
        멘토 1인당
        <Input type="number" inputMode="numeric" min={1} max={GROUP_MAX_PER_MENTOR_LIMIT} value={max} disabled={!enabled || pending || !canEdit} onChange={(e) => setMax(e.target.value)} className="h-9 w-20 text-center" />
        회까지
      </label>
      <Button size="sm" className="ml-auto" disabled={!dirty || pending || !canEdit} onClick={save}>
        {pending ? '저장 중…' : '적용'}
      </Button>
    </div>
  );
}
