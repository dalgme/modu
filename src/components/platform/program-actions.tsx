'use client';

import { useState, useTransition } from 'react';

import { addProgramStaffAction, createPlatformAdminAction, setPlatformAdminAction, setProgramStatusAction } from '@/lib/platform/actions';
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

export function PlatformAdminsForm({ admins, isOwner }: { admins: { id: string; name: string; email: string | null; role: string; is_active: boolean; platform_role: string | null; position: string | null }[]; isOwner: boolean }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [cred, setCred] = useState<{ email: string; tempPassword: string } | null>(null);
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
            <span className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.platform_role === 'owner' ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-800'}`}>{a.platform_role === 'owner' ? '통합관리자' : '부관리자'}</span>
              <b>{a.name}</b>
              <span className="text-xs text-muted-foreground">{a.email}{a.position ? ` · ${a.position}` : ''}{!a.is_active ? ' · 비활성' : ''}</span>
            </span>
            {isOwner && a.platform_role !== 'owner' && (
              <Button size="sm" variant="ghost" disabled={pending || !a.email} onClick={() => { if (confirm('부관리자 권한을 해제할까요? 계정 자체는 유지됩니다.')) run(a.email!, false); }}>해제</Button>
            )}
          </li>
        ))}
      </ul>
      {isOwner ? (
        <>
          <form className="flex flex-col gap-2 rounded-xl border bg-background p-4" action={(fd) => run(String(fd.get('email') ?? ''), true)}>
            <p className="text-sm font-semibold">기존 계정을 부관리자로 지정</p>
            <div className="flex gap-2">
              <Input name="email" type="email" placeholder="계정 이메일 (소속·역할 무관)" required />
              <Button type="submit" size="sm" disabled={pending}>지정</Button>
            </div>
          </form>
          <form
            className="flex flex-col gap-2 rounded-xl border bg-background p-4"
            action={(fd) =>
              start(async () => {
                const r = await createPlatformAdminAction({ email: String(fd.get('email') ?? ''), name: String(fd.get('name') ?? ''), phone: String(fd.get('phone') ?? ''), position: String(fd.get('position') ?? '') });
                if (!r.ok) {
                  toast({ title: r.error, variant: 'destructive' });
                  return;
                }
                setCred(r.credential);
                toast({ title: '부관리자 계정을 발급했습니다.' });
              })
            }
          >
            <p className="text-sm font-semibold">새 부관리자 계정 발급 (행사 소속 없음)</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <Input name="email" type="email" placeholder="이메일" required />
              <Input name="name" placeholder="이름" required />
              <Input name="phone" placeholder="휴대폰 (임시 비밀번호)" />
              <Input name="position" placeholder="직위" />
            </div>
            <div className="flex justify-end"><Button type="submit" size="sm" disabled={pending}>발급</Button></div>
            {cred && (
              <p className="rounded-md border border-emerald-300 bg-emerald-50/50 px-3 py-2 text-xs">
                <b>{cred.email}</b> · 임시 비밀번호 <code className="font-mono">{cred.tempPassword}</code> (이 화면을 벗어나면 다시 볼 수 없습니다)
              </p>
            )}
          </form>
        </>
      ) : (
        <p className="rounded-xl border border-dashed bg-background/60 p-4 text-xs text-muted-foreground">부관리자 지정·해제는 통합관리자(owner) 계정으로 로그인해 진행합니다.</p>
      )}
    </div>
  );
}
