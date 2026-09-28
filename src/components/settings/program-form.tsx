'use client';

import { useTransition } from 'react';

import type { ProgramRow } from '@/lib/settings/data';
import { updateProgramAction } from '@/lib/settings/actions';
import { parsePrivacyOfficer } from '@/lib/ops/retention';
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

/** (P35-B) 개인정보 보호책임자 2명 — 발주처 보호책임자 · 운영사 PL. 침해사고 통지·보존 만료 알림 수신자. */
const OFFICERS: { key: 'client' | 'operator'; title: string; hint: string }[] = [
  { key: 'client', title: '발주처 개인정보 보호책임자', hint: '침해사고 발생 시 통지 책임 주체. 처리방침의 보호책임자 문의처.' },
  { key: 'operator', title: '운영사 메인 담당(PL)', hint: '보존기간 만료·파기 검토 알림, 침해사고 1차 대응 연락처.' },
];

export function ProgramForm({ program }: { program: ProgramRow }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const officer = parsePrivacyOfficer(program.privacy_officer);
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

      {/* (P35-B) 개인정보 보존기간 — 처리방침·멘티 동의문·보존 만료 알림(매주 점검, 만료 30일 전 문자)이 이 값을 읽는다 */}
      <div className="sm:col-span-2 mt-2 rounded-lg border bg-muted/20 p-4">
        <p className="text-sm font-semibold">개인정보 보존기간</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          사업 종료일(행사 종료일) 후 N년간 보유하고 파기합니다. 개인정보처리방침·멘티 동의문에 이 값이 표시되고, 만료 30일 전부터 보호책임자에게 문자로 알립니다. 자동 파기는 하지 않습니다.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Label htmlFor="retention_years" className="whitespace-nowrap">사업 종료 후</Label>
          <Input id="retention_years" name="retention_years" type="number" min={1} max={10} className="w-24" defaultValue={program.retention_years ?? 5} required disabled={pending} />
          <span className="text-sm">년</span>
          <span className="ml-2 text-[11px] text-muted-foreground">(기본 5년 · 1~10)</span>
        </div>
      </div>

      <div className="sm:col-span-2 rounded-lg border bg-muted/20 p-4">
        <p className="text-sm font-semibold">개인정보 보호책임자 연락망</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">침해사고 통지·보존기간 만료 알림 수신자입니다. 휴대폰이 비어 있으면 플랫폼 관리자에게만 알립니다.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {OFFICERS.map((o) => {
            const cur = officer[o.key] ?? {};
            return (
              <fieldset key={o.key} className="flex flex-col gap-2 rounded-md border bg-background p-3">
                <legend className="px-1 text-xs font-semibold">{o.title}</legend>
                <p className="text-[11px] text-muted-foreground">{o.hint}</p>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`officer_${o.key}_name`}>이름</Label>
                  <Input id={`officer_${o.key}_name`} name={`officer_${o.key}_name`} defaultValue={cur.name ?? ''} disabled={pending} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`officer_${o.key}_phone`}>휴대폰</Label>
                  <Input id={`officer_${o.key}_phone`} name={`officer_${o.key}_phone`} type="tel" inputMode="tel" placeholder="010-0000-0000" defaultValue={cur.phone ?? ''} disabled={pending} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`officer_${o.key}_email`}>이메일</Label>
                  <Input id={`officer_${o.key}_email`} name={`officer_${o.key}_email`} type="email" defaultValue={cur.email ?? ''} disabled={pending} />
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>

      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  );
}
