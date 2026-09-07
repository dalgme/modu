'use client';

import { useTransition } from 'react';

import type { ProgramRow } from '@/lib/settings/data';
import { updateProgramAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const FIELDS: { name: keyof ProgramRow; label: string; hint?: string; type?: string; required?: boolean }[] = [
  { name: 'name', label: '행사명', required: true },
  { name: 'client_name', label: '발주처 기관명', hint: '모든 화면·문서·알림의 {client} 에 반영', required: true },
  { name: 'client_short', label: '발주처 약칭' },
  { name: 'client_seal_name', label: '발주처 직인 명의', hint: '관찰의견서·정산서 직인 자리' },
  { name: 'operator_name', label: '용역사(운영) 기관명', hint: '{operator} 에 반영', required: true },
  { name: 'operator_short', label: '운영사 약칭' },
  { name: 'operator_contact', label: '운영사 대표 연락처' },
  { name: 'app_title', label: '앱 타이틀', hint: '브라우저 탭·설치 앱 이름' },
  { name: 'sms_footer', label: '문자 꼬리말', hint: '모든 문자 뒤에 붙는 문구' },
  { name: 'email_subject_prefix', label: '이메일 제목 접두어' },
  { name: 'starts_on', label: '행사 시작일', type: 'date' },
  { name: 'ends_on', label: '행사 종료일', type: 'date' },
  { name: 'default_required_rounds', label: '기본 회차 수', type: 'number', hint: '새 그룹의 기본값' },
];

export function ProgramForm({ program }: { program: ProgramRow }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4 rounded-xl border bg-background p-4 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          const r = await updateProgramAction(Object.fromEntries(fd.entries()));
          toast(r.ok ? { title: '행사 기본 설정을 저장했습니다. 모든 화면에 반영됩니다.' } : { title: r.error, variant: 'destructive' });
        })
      }
    >
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1">
          <Label htmlFor={f.name}>
            {f.label} {f.required && <span className="text-destructive">*</span>}
          </Label>
          <Input id={f.name} name={f.name} type={f.type ?? 'text'} defaultValue={(program[f.name] as string | number | null) ?? ''} required={f.required} disabled={pending} />
          {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
        </div>
      ))}
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  );
}
