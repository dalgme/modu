'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { updateProgramInfoAction } from '@/lib/platform/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export interface ProgramInfo {
  id: string;
  slug: string;
  name: string;
  client_name: string;
  client_short: string | null;
  operator_name: string;
  operator_short: string | null;
  app_title: string | null;
  default_required_rounds: number;
  starts_on: string | null;
  ends_on: string | null;
}

const FIELDS: { name: keyof Omit<ProgramInfo, 'id' | 'slug'>; label: string; type?: string; required?: boolean; hint?: string }[] = [
  { name: 'name', label: '행사명', required: true },
  { name: 'client_name', label: '발주처 기관명', required: true, hint: '이 행사의 모든 화면·문서·알림의 발주처 표기' },
  { name: 'client_short', label: '발주처 약칭' },
  { name: 'operator_name', label: '용역사(운영) 기관명', required: true },
  { name: 'operator_short', label: '운영사 약칭' },
  { name: 'app_title', label: '앱 타이틀', hint: '브라우저 탭·설치 앱 이름' },
  { name: 'default_required_rounds', label: '기본 회차 수', type: 'number', hint: '새 그룹의 기본값 (그룹별 조정 가능)' },
  { name: 'starts_on', label: '시작일', type: 'date' },
  { name: 'ends_on', label: '종료일', type: 'date' },
];

/** 플랫폼 콘솔 — 행사 개설정보 수정 */
export function ProgramEditForm({ program }: { program: ProgramInfo }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          const r = await updateProgramInfoAction(program.id, Object.fromEntries(fd.entries()));
          toast(r.ok ? { title: '행사 정보를 저장했습니다.' } : { title: r.error, variant: 'destructive' });
          if (r.ok) router.refresh();
        })
      }
    >
      <div className="flex flex-col gap-1 sm:col-span-2">
        <Label>관리코드</Label>
        <p className="font-mono text-sm">{program.slug}</p>
        <p className="text-[11px] text-muted-foreground">플랫폼이 자동 부여합니다 (개설연도 + 연도별 순번). 직접 수정하지 않습니다.</p>
      </div>
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1">
          <Label htmlFor={`p-${f.name}`}>
            {f.label} {f.required && <span className="text-destructive">*</span>}
          </Label>
          <Input id={`p-${f.name}`} name={f.name} type={f.type ?? 'text'} defaultValue={(program[f.name] as string | number | null) ?? ''} required={f.required} disabled={pending} min={f.type === 'number' ? 1 : undefined} />
          {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
        </div>
      ))}
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? '저장 중…' : '개설정보 저장'}</Button>
      </div>
    </form>
  );
}
