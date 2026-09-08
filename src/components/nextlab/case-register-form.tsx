'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { registerCaseAction } from '@/lib/workflow/case-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

/** 멘티(케이스) 등록 폼 (T1) — 저장 시 멘티 계정 자동 발급(휴대폰 기반 임시 비밀번호) */
export function CaseRegisterForm({ groups, defaultGroupId }: { groups: { id: string; name: string; code: string }[]; defaultGroupId?: string | null }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ caseId: string; credential?: { email: string; tempPassword: string }; linkedExisting?: boolean } | null>(null);

  if (done) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50/40 p-4 text-sm">
        <p className="font-semibold">멘티를 등록했습니다.</p>
        {done.credential ? (
          <p>
            로그인 이메일 <b>{done.credential.email}</b> · 임시 비밀번호 <b className="font-mono">{done.credential.tempPassword}</b> (최초 로그인 시 변경 강제). 이 화면을 벗어나면 다시 볼 수 없으니 지금 안내하세요.
          </p>
        ) : done.linkedExisting ? (
          <p>
            이메일·휴대폰이 일치하는 <b>기존 계정을 이 케이스의 멘티로 연결</b>했습니다(새 계정 발급 없음). 그 계정은 기존 비밀번호로 로그인하며, 허브에서 이 행사를 고르면 멘티 화면이 열립니다.
          </p>
        ) : (
          <p className="text-muted-foreground">멘티 계정은 발급되지 않았습니다(휴대폰 형식 확인). 케이스 상세에서 초대할 수 있습니다.</p>
        )}
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link href={`/nextlab/cases/${done.caseId}`}>케이스 상세 · 멘토 배정</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDone(null)}>
            계속 등록
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4 rounded-xl border bg-background p-4 sm:grid-cols-2"
      action={(fd) =>
        start(async () => {
          const r = await registerCaseAction(Object.fromEntries(fd.entries()));
          if (!r.ok) {
            toast({ title: r.error, variant: 'destructive' });
            return;
          }
          setDone({ caseId: r.caseId, credential: r.menteeCredential, linkedExisting: r.linkedExisting });
        })
      }
    >
      <div className="flex flex-col gap-1 sm:col-span-2">
        <Label>사업그룹 *</Label>
        <select name="support_type_id" defaultValue={defaultGroupId ?? groups[0]?.id ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm" required>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} · {g.name}
            </option>
          ))}
        </select>
      </div>
      <F name="business_name" label="기업(팀)명 *" required />
      <F name="owner_name" label="멘티 이름(대표자) *" required />
      <F name="phone" label="휴대폰 *" required placeholder="010-0000-0000" hint="로그인 아이디·임시 비밀번호에 사용" />
      <F name="email" label="이메일" type="email" hint="비우면 자동 생성" />
      <F name="business_reg_no" label="사업자등록번호" hint="예비창업자는 비워도 됩니다" />
      <F name="address" label="주소" />
      <F name="business_type" label="업종" />
      <F name="item" label="아이템" />
      <F name="opened_at" label="개업일" type="date" />
      <F name="employee_count" label="종업원 수" type="number" />
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" disabled={pending || groups.length === 0}>
          {pending ? '등록 중…' : '멘티 등록 · 계정 발급'}
        </Button>
      </div>
    </form>
  );
}

function F({ name, label, type = 'text', required, placeholder, hint }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} placeholder={placeholder} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
