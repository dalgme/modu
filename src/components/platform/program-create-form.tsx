'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { createProgramAction } from '@/lib/platform/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function ProgramCreateForm({ sources }: { sources: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ programId: string; credential?: { email: string; tempPassword: string }; warn?: string } | null>(null);

  if (done) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 text-sm">
        <p className="font-semibold">행사를 개설했습니다.</p>
        {done.credential && (
          <p>
            첫 운영사 계정 — 이메일 <b>{done.credential.email}</b> · 임시 비밀번호 <b className="font-mono">{done.credential.tempPassword}</b> (최초 로그인 시 변경 강제). 이 화면을 벗어나면 다시 볼 수 없습니다.
          </p>
        )}
        {done.warn && <p className="text-destructive">첫 계정 발급 실패: {done.warn} — 행사 상세에서 다시 발급하세요.</p>}
        <div className="flex gap-2">
          <Button asChild size="sm"><Link href={`/platform/programs/${done.programId}`}>행사 상세</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/hub">허브에서 진입</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4 rounded-xl border bg-background p-4 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          const r = await createProgramAction(Object.fromEntries(fd.entries()));
          if (!r.ok) {
            toast({ title: r.error, variant: 'destructive' });
            return;
          }
          setDone({ programId: r.programId, credential: r.credential, warn: r.warn });
        })
      }
    >
      <F name="slug" label="슬러그 *" placeholder="modu-2027" hint="영문 소문자·숫자·하이픈. URL·식별자로 쓰입니다." required />
      <F name="name" label="행사명 *" placeholder="모두의창업 2027" required />
      <F name="client_name" label="발주처 기관명 *" required />
      <F name="client_short" label="발주처 약칭" />
      <F name="operator_name" label="용역사(운영) 기관명 *" required />
      <F name="operator_short" label="운영사 약칭" />
      <F name="app_title" label="앱 타이틀" placeholder="비우면 행사명" />
      <F name="default_required_rounds" label="기본 회차 수" type="number" defaultValue="4" />
      <F name="starts_on" label="시작일" type="date" />
      <F name="ends_on" label="종료일" type="date" />
      <div className="flex flex-col gap-1 sm:col-span-2">
        <Label>설정 복제 원천 (선택)</Label>
        <select name="clone_from" defaultValue="" className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">복제 안 함 (빈 행사)</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>{s.name} 의 설정을 복제</option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">그룹(코드·회차·필수서류)·단가·한도(오늘 적용일)·원천징수 파라미터·종결 게이트·서명 정책·보고서 양식·만족도 양식·키워드를 복제합니다.</p>
      </div>
      <fieldset className="grid gap-3 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">첫 운영사 계정 발급 (선택)</legend>
        <F name="first_email" label="이메일" type="email" />
        <F name="first_name" label="이름" />
        <F name="first_phone" label="휴대폰" />
      </fieldset>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={pending}>{pending ? '개설 중…' : '행사 개설'}</Button>
      </div>
    </form>
  );
}

function F({ name, label, type = 'text', required, placeholder, hint, defaultValue }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string; hint?: string; defaultValue?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
