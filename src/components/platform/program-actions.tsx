'use client';

import { useState, useTransition } from 'react';

import { addProgramStaffAction, setPlatformAdminAction, setProgramStatusAction } from '@/lib/platform/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export function ProgramStatusButton({ programId, status }: { programId: string; status: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const next = status === 'active' ? 'ended' : 'active';
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => {
        if (!confirm(next === 'ended' ? '행사를 종료할까요? 회원들의 허브에서 종료 탭으로 이동하며 데이터는 유지됩니다.' : '행사를 다시 진행 중으로 바꿀까요?')) return;
        start(async () => {
          const r = await setProgramStatusAction(programId, next);
          toast(r.ok ? { title: '변경했습니다.' } : { title: r.error, variant: 'destructive' });
        });
      }}
    >
      {next === 'ended' ? '종료' : '재개'}
    </Button>
  );
}

export function AddStaffForm({ programId }: { programId: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [cred, setCred] = useState<{ email: string; tempPassword: string } | null>(null);
  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-5"
      action={(fd) =>
        start(async () => {
          const r = await addProgramStaffAction(programId, { email: String(fd.get('email') ?? ''), name: String(fd.get('name') ?? ''), phone: String(fd.get('phone') ?? ''), role: (fd.get('role') as 'nextlab' | 'institution') ?? 'nextlab' });
          if (!r.ok) {
            toast({ title: r.error, variant: 'destructive' });
            return;
          }
          setCred(r.credential ?? null);
          toast({ title: r.credential ? '계정을 발급하고 행사에 추가했습니다.' : '기존 계정을 행사에 추가했습니다.' });
        })
      }
    >
      <select name="role" defaultValue="nextlab" className="h-9 rounded-md border bg-background px-2 text-sm">
        <option value="nextlab">운영사</option>
        <option value="institution">발주처</option>
      </select>
      <Input name="email" type="email" placeholder="이메일 (기존 계정이면 멤버십만 추가)" required />
      <Input name="name" placeholder="이름 (새 계정)" />
      <Input name="phone" placeholder="휴대폰" />
      <Button type="submit" size="sm" disabled={pending}>추가·발급</Button>
      {cred && (
        <p className="sm:col-span-5 rounded-md border border-emerald-300 bg-emerald-50/50 px-3 py-2 text-xs">
          발급: <b>{cred.email}</b> · 임시 비밀번호 <b className="font-mono">{cred.tempPassword}</b> — 지금 안내하세요(다시 볼 수 없음).
        </p>
      )}
    </form>
  );
}

export function PlatformAdminsForm({ admins }: { admins: { id: string; name: string; email: string | null; role: string; is_active: boolean }[] }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const run = (email: string, isAdmin: boolean) =>
    start(async () => {
      const r = await setPlatformAdminAction(email, isAdmin);
      toast(r.ok ? { title: '변경했습니다.' } : { title: r.error, variant: 'destructive' });
    });
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1 rounded-xl border bg-background p-4 text-sm">
        {admins.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
            <span><b>{a.name}</b> <span className="text-xs text-muted-foreground">{a.email} · {a.role === 'nextlab' ? '운영사' : a.role}</span></span>
            <Button size="sm" variant="ghost" disabled={pending || !a.email} onClick={() => { if (confirm('플랫폼 관리자 권한을 해제할까요?')) run(a.email!, false); }}>해제</Button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2 rounded-xl border bg-background p-4" action={(fd) => run(String(fd.get('email') ?? ''), true)}>
        <Input name="email" type="email" placeholder="지정할 스태프 계정 이메일" required />
        <Button type="submit" size="sm" disabled={pending}>플랫폼 관리자 지정</Button>
      </form>
    </div>
  );
}
