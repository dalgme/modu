'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CASE_STATUSES, CASE_STATUS_META } from '@/types/case-status';

interface CaseFiltersProps {
  supportTypes: { id: string; name: string }[];
  mentors: { id: string; name: string }[];
}

const ALL = '__all__';

export function CaseFilters({ supportTypes, mentors }: CaseFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">지원유형</Label>
        <Select value={params.get('type') ?? ALL} onValueChange={(v) => setParam('type', v)}>
          <SelectTrigger>
            <SelectValue placeholder="전체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체</SelectItem>
            {supportTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">단계</Label>
        <Select value={params.get('status') ?? ALL} onValueChange={(v) => setParam('status', v)}>
          <SelectTrigger>
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
          <SelectTrigger>
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
        <Label className="text-xs">등록 시작</Label>
        <Input
          type="date"
          value={params.get('from') ?? ''}
          onChange={(e) => setParam('from', e.target.value || undefined)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">등록 종료</Label>
        <div className="flex gap-2">
          <Input
            type="date"
            value={params.get('to') ?? ''}
            onChange={(e) => setParam('to', e.target.value || undefined)}
          />
          <Button variant="outline" size="sm" onClick={() => router.replace(pathname)}>
            초기화
          </Button>
        </div>
      </div>
    </div>
  );
}
