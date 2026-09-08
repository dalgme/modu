'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { platformResetPasswordAction, platformSetMembershipAction, platformSetUserActiveAction } from '@/lib/platform/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ProgramOpt {
  id: string;
  name: string;
  status: string;
}

/** 계정 통합 조회 행 액션 — 임시 비밀번호 재발급 · 활성/비활성 · 행사 소속 추가/해제 */
type Role = 'institution' | 'nextlab' | 'mentor' | 'mentee';
const ROLE_LABEL: Record<Role, string> = { institution: '발주처', nextlab: '운영사', mentor: '멘토', mentee: '멘티' };

export function PlatformUserActions({ userId, isActive, isSelf, isPlatformAdmin, memberOf, programs, defaultRole }: { userId: string; isActive: boolean; isSelf: boolean; isPlatformAdmin: boolean; memberOf: { id: string; role: Role }[]; programs: ProgramOpt[]; defaultRole: Role }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [temp, setTemp] = useState<string | null>(null);
  const [addId, setAddId] = useState('');
  const [addRole, setAddRole] = useState<Role>(defaultRole);
  const memberIds = memberOf.map((m) => m.id);
  const addable = programs.filter((p) => !memberIds.includes(p.id));

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      toast(r.ok ? { title: done } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={pending}
          onClick={() => {
            if (!confirm('임시 비밀번호를 재발급할까요? 기존 비밀번호는 즉시 무효가 됩니다.')) return;
            start(async () => {
              const r = await platformResetPasswordAction(userId);
              if (!r.ok) {
                toast({ title: r.error, variant: 'destructive' });
                return;
              }
              setTemp(r.tempPassword);
              toast({ title: '임시 비밀번호를 재발급했습니다. 본인에게 전달하세요.' });
              router.refresh();
            });
          }}
        >
          비밀번호 재발급
        </Button>
        {!isSelf && !isPlatformAdmin && (
          <Button
            size="sm"
            variant={isActive ? 'ghost' : 'outline'}
            className={`h-7 px-2 text-xs ${isActive ? 'text-destructive hover:text-destructive' : ''}`}
            disabled={pending}
            onClick={() => {
              if (!confirm(isActive ? '이 계정을 비활성화할까요? 모든 행사에서 로그인이 막힙니다.' : '이 계정을 다시 활성화할까요?')) return;
              run(() => platformSetUserActiveAction(userId, !isActive), isActive ? '비활성화했습니다.' : '활성화했습니다.');
            }}
          >
            {isActive ? '비활성화' : '활성화'}
          </Button>
        )}
      </div>
      {temp && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50/60 px-2 py-1 font-mono text-[11px] text-emerald-900">
          임시 비밀번호: <b>{temp}</b> <span className="font-sans text-emerald-700">(이 화면을 벗어나면 다시 볼 수 없습니다)</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {memberOf.map(({ id: pid, role }) => {
          const p = programs.find((x) => x.id === pid);
          if (!p) return null;
          return (
            <span key={pid} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              {p.name}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold ${role === defaultRole ? 'bg-background text-foreground' : 'bg-violet-100 text-violet-800'}`}>{ROLE_LABEL[role]}</span>
              {p.status !== 'active' && <span className="text-muted-foreground">(종료)</span>}
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                title="이 행사 소속 해제"
                disabled={pending}
                onClick={() => {
                  if (!confirm(`'${p.name}' 소속을 해제할까요? 이 행사 화면에 더 이상 들어갈 수 없습니다(이력은 보존).`)) return;
                  run(() => platformSetMembershipAction(userId, pid, false), '행사 소속을 해제했습니다.');
                }}
              >
                ×
              </button>
            </span>
          );
        })}
        {addable.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <select value={addId} onChange={(e) => setAddId(e.target.value)} className="h-7 rounded-md border bg-background px-1 text-xs">
              <option value="">+ 행사 소속 추가</option>
              {addable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.status !== 'active' ? ' (종료)' : ''}
                </option>
              ))}
            </select>
            {addId && (
              <>
                <select value={addRole} onChange={(e) => setAddRole(e.target.value as Role)} className="h-7 rounded-md border bg-background px-1 text-xs" title="이 행사에서의 역할">
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={pending} onClick={() => {
                    run(() => platformSetMembershipAction(userId, addId, true, addRole), '행사에 추가했습니다.');
                    setAddId('');
                  }}
                >
                  추가
                </Button>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
