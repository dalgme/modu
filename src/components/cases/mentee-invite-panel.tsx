'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { UserPlus } from 'lucide-react';

import { inviteMenteeAction, type MemberActionState } from '@/lib/auth/member-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function InviteSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <UserPlus className="h-4 w-4" />
      {pending ? '초대 중…' : '멘티 초대 (계정 발급)'}
    </Button>
  );
}

interface MenteeInvitePanelProps {
  caseId: string;
  /** 이미 멘티 계정이 연결되어 있으면 초대 완료 상태 표시 */
  menteeLinked: boolean;
  menteeName?: string | null;
  /** 신청자 정보 프리필 (케이스 대표자·연락처·이메일) */
  defaultName?: string | null;
  defaultPhone?: string | null;
  defaultEmail?: string | null;
}

/**
 * 운영사: 케이스에 멘티(멘티기업) 로그인 계정을 발급하고 mentee_id 를 연결한다.
 * 초대 완료 후 멘티는 임시 비밀번호로 로그인 → 비밀번호 변경 → 개인정보 동의 후 활성화된다.
 */
export function MenteeInvitePanel({
  caseId,
  menteeLinked,
  menteeName,
  defaultName,
  defaultPhone,
  defaultEmail,
}: MenteeInvitePanelProps) {
  const [state, action] = useFormState<MemberActionState, FormData>(inviteMenteeAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (menteeLinked) {
    return (
      <Card className="border-status-approved/30 bg-status-approved/5">
        <CardHeader>
          <CardTitle className="text-base">멘티 계정</CardTitle>
          <CardDescription>
            멘티 계정이 연결되어 있습니다{menteeName ? ` · ${menteeName}` : ''}. 멘티는 본인
            대시보드에서 진행 현황·서류 등록을 진행할 수 있습니다.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">멘티 초대 (계정 발급)</CardTitle>
        <CardDescription>
          멘티기업 로그인 계정을 발급하고 이 케이스에 연결합니다. 임시 비밀번호(=휴대폰 번호)로
          최초 로그인 후 비밀번호 변경·개인정보 동의를 거쳐 활성화됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form ref={formRef} action={action} className="flex flex-col gap-3">
          <input type="hidden" name="caseId" value={caseId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-name">대표자명</Label>
              <Input
                id="invite-name"
                name="name"
                defaultValue={defaultName ?? ''}
                required
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-phone">휴대폰 번호 (임시 비밀번호)</Label>
              <Input
                id="invite-phone"
                name="phone"
                defaultValue={defaultPhone ?? ''}
                placeholder="01012345678"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">이메일 (로그인 아이디)</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              defaultValue={defaultEmail ?? ''}
              required
              autoComplete="off"
            />
          </div>
          <div>
            <InviteSubmit />
          </div>
        </form>

        {state && !state.ok && (
          <p className="text-sm text-status-rejected">{state.error}</p>
        )}
        {state?.ok && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium text-primary">{state.message}</p>
            {state.email && <p className="mt-1 text-muted-foreground">{state.email}</p>}
            {state.tempPassword && (
              <>
                <p className="mt-2 font-medium text-primary">임시 비밀번호 (한 번만 표시됩니다)</p>
                <code className="mt-1 block break-all rounded bg-background px-2 py-1 font-mono text-base">
                  {state.tempPassword}
                </code>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
