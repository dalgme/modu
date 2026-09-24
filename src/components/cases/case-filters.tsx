'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CASE_STATUSES, CASE_STATUS_META } from '@/types/case-status';
import { cn } from '@/lib/utils';

interface CaseFiltersProps {
  mentors: { id: string; name: string }[];
  /** 초기화 시 남길 파라미터 (tab·group·from·to 등) */
  keep?: string[];
}

const ALL = '__all__';
export const CASE_SORTS = [
  { key: 'recent', label: '최근 등록순' },
  { key: 'name', label: '이름순' },
  { key: 'status', label: '단계순' },
  { key: 'rounds', label: '회차 적은 순' },
] as const;
export type CaseSortKey = (typeof CASE_SORTS)[number]['key'];

/**
 * 케이스 목록 필터 (리포트 › 진행현황, P30) — URL 파라미터 status / mentor / q / sort.
 * 대시보드의 `?tab=cases&status=closure_requested` 링크와 호환. 범위(행사/그룹)는 상단 스위처, 기간은 기간 칩이 맡는다.
 */
export function CaseFilters({ mentors, keep = ['tab', 'group', 'view', 'from', 'to'] }: CaseFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    // (P31) 필터 변경 시 스크롤 위치 유지
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  function reset() {
    const next = new URLSearchParams();
    for (const k of keep) {
      const v = params.get(k);
      if (v) next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  // (P31) 폰에서는 접힌 상태로 시작(요약 "필터 · n개 적용"), sm 이상은 항상 펼침 — <details> 는 닫히면 데스크톱에서도 숨겨져 상태로 처리
  const applied = ['status', 'mentor', 'q', 'sort'].filter((k) => params.get(k)).length;

  return (
    <div className="rounded-lg border bg-card">
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold sm:hidden">
        <span>필터 · {applied}개 적용</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>
    <div className={cn('grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5', !expanded && 'hidden sm:grid')}>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">단계</Label>
        <Select value={params.get('status') ?? ALL} onValueChange={(v) => setParam('status', v)}>
          <SelectTrigger className="h-10 sm:h-9">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체</SelectItem>
            {CASE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CASE_STATUS_META[s].step}. {CASE_STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">담당 멘토</Label>
        <Select value={params.get('mentor') ?? ALL} onValueChange={(v) => setParam('mentor', v)}>
          <SelectTrigger className="h-10 sm:h-9">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체</SelectItem>
            {mentors.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">이름·기업(팀)·연락처 검색</Label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setParam('q', q.trim() || undefined);
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색 후 Enter" className="h-10 sm:h-9" />
        </form>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">정렬</Label>
        <Select value={params.get('sort') ?? 'recent'} onValueChange={(v) => setParam('sort', v === 'recent' ? undefined : v)}>
          <SelectTrigger className="h-10 sm:h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CASE_SORTS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end">
        <Button variant="outline" size="sm" className="h-10 w-full sm:h-9 sm:w-auto" onClick={reset}>
          필터 초기화
        </Button>
      </div>
    </div>
    </div>
  );
}
