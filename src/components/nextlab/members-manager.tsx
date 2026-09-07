'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';

import {
  createMemberAction,
  setMemberActiveAction,
  resetMemberPasswordAction,
  deleteMemberAction,
  type MemberActionState,
} from '@/lib/auth/member-actions';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ViewAsStartButton } from '@/components/nextlab/view-as-start-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface MemberItem {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
}

/** 발급 가능한 역할 (멘티는 케이스 초대 플로우로만 생성) */
const ISSUABLE_ROLES: UserRole[] = ['institution', 'nextlab', 'mentor'];

function TempPasswordNotice({ email, tempPassword }: { email?: string; tempPassword?: string }) {
  if (!tempPassword) return null;
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <p className="font-medium text-primary">임시 비밀번호 (한 번만 표시됩니다)</p>
      {email && <p className="mt-1 text-muted-foreground">{email}</p>}
      <code className="mt-1 block break-all rounded bg-background px-2 py-1 font-mono text-base">
        {tempPassword}
      </code>
    </div>
  );
}

function CreateSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? '발급 중…' : '계정 발급'}
    </Button>
  );
}

function CreateMemberForm() {
  const [state, action] = useFormState<MemberActionState, FormData>(createMemberAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // 발급 성공 시 입력 폼을 빈칸으로 리셋 (임시비번 안내는 state 로 유지)
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">회원 계정 발급</CardTitle>
        <CardDescription>
          진흥원 담당자 · 넥스트랩 · 멘토 계정을 발급합니다. 멘티는 케이스 등록 후 초대됩니다.
          <br />
          <span className="text-primary">임시 비밀번호는 입력한 휴대폰 번호(숫자)로 발급되며, 첫 로그인 시 변경해야 합니다.</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={action} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-email">이메일</Label>
              <Input id="m-email" name="email" type="email" required autoComplete="off" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-name">이름</Label>
              <Input id="m-name" name="name" required autoComplete="off" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-phone">휴대폰 번호 (임시 비밀번호)</Label>
              <Input
                id="m-phone"
                name="phone"
                required
                autoComplete="off"
                placeholder="010-0000-0000"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-role">역할</Label>
              <select
                id="m-role"
                name="role"
                required
                defaultValue="mentor"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {ISSUABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {state?.ok === false && (
            <p className="text-sm font-medium text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-status-approved">{state.message}</p>
              <TempPasswordNotice email={state.email} tempPassword={state.tempPassword} />
            </div>
          )}

          <div>
            <CreateSubmit />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RowSubmit({ children, variant }: { children: string; variant?: 'outline' | 'destructive' }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant ?? 'outline'} disabled={pending}>
      {pending ? '처리 중…' : children}
    </Button>
  );
}

function ToggleActiveForm({ member }: { member: MemberItem }) {
  const [, action] = useFormState<MemberActionState, FormData>(setMemberActiveAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="userId" value={member.id} />
      <input type="hidden" name="active" value={member.is_active ? 'false' : 'true'} />
      <RowSubmit variant={member.is_active ? 'destructive' : 'outline'}>
        {member.is_active ? '비활성화' : '활성화'}
      </RowSubmit>
    </form>
  );
}

function ResetPasswordForm({ member }: { member: MemberItem }) {
  const [state, action] = useFormState<MemberActionState, FormData>(
    resetMemberPasswordAction,
    undefined,
  );
  return (
    <div className="flex flex-col items-end gap-2">
      <form action={action}>
        <input type="hidden" name="userId" value={member.id} />
        <RowSubmit>비밀번호 재설정</RowSubmit>
      </form>
      {state?.ok && state.tempPassword && (
        <TempPasswordNotice tempPassword={state.tempPassword} />
      )}
      {state?.ok === false && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}

function DeleteMemberForm({ member }: { member: MemberItem }) {
  const [state, action] = useFormState<MemberActionState, FormData>(deleteMemberAction, undefined);
  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={action}
        onSubmit={(e) => {
          if (
            !window.confirm(
              `'${member.name}' 회원을 영구 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`,
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="userId" value={member.id} />
        <RowSubmit variant="destructive">삭제</RowSubmit>
      </form>
      {state?.ok === false && (
        <p className="max-w-[220px] text-right text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}

type MemberTab = 'all' | 'staff' | 'mentor' | 'mentee';

const MEMBER_TABS: { key: MemberTab; label: string; match: (r: UserRole) => boolean }[] = [
  { key: 'all', label: '전체', match: () => true },
  { key: 'staff', label: '관리', match: (r) => r === 'institution' || r === 'nextlab' },
  { key: 'mentor', label: '멘토', match: (r) => r === 'mentor' },
  { key: 'mentee', label: '멘티', match: (r) => r === 'mentee' },
];

export function MembersManager({ members }: { members: MemberItem[] }) {
  const [tab, setTab] = useState<MemberTab>('all');
  const activeTab = MEMBER_TABS.find((t) => t.key === tab) ?? MEMBER_TABS[0]!;
  const filtered = members.filter((m) => activeTab.match(m.role));

  return (
    <div className="flex flex-col gap-6">
      <CreateMemberForm />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1 border-b">
          {MEMBER_TABS.map((t) => {
            const count = members.filter((m) => t.match(m.role)).length;
            const isActive = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}{' '}
                <span className="tabular-nums text-xs text-muted-foreground">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    해당 구분의 회원이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.name}
                    {m.phone && (
                      <span className="ml-1 text-xs text-muted-foreground">· {m.phone}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.email ?? '-'}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ROLE_LABELS[m.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={m.is_active ? 'default' : 'outline'}>
                        {m.is_active ? '활성' : '비활성'}
                      </Badge>
                      {m.must_change_password && (
                        <Badge variant="outline" className="text-xs">
                          비번변경대기
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      {/* 멘토는 '화면 보기' 가 곧 대행 시작 — 들어가서 바로 업무를 처리할 수 있어야 한다.
                          (열람만 하려면 대행 배너의 [대행 종료] 를 누르면 된다) */}
                      {m.role === 'mentor' && m.is_active ? (
                        <ViewAsStartButton
                          targetUserId={m.id}
                          targetName={m.name}
                          size="sm"
                          variant="outline"
                          label="화면 보기"
                        />
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/nextlab/view/${m.id}`}>화면 보기</Link>
                        </Button>
                      )}
                      <ToggleActiveForm member={m} />
                      <ResetPasswordForm member={m} />
                      <DeleteMemberForm member={m} />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
