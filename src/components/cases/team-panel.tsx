'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Users } from 'lucide-react';

import { saveTeamInfoAction, saveTeamMemberAction, deleteTeamMemberAction } from '@/lib/workflow/team-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ActionState = { ok: true; message: string } | { ok: false; error: string } | undefined;

export interface TeamMemberItem {
  id: string;
  name: string;
  member_role: string | null;
  phone: string | null;
  email: string | null;
  is_representative: boolean;
}

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? '저장 중…' : children}
    </Button>
  );
}

function StateLine({ state }: { state: ActionState }) {
  if (!state) return null;
  return state.ok ? (
    <span className="text-xs text-status-approved">{state.message}</span>
  ) : (
    <span className="text-xs text-destructive">{state.error}</span>
  );
}

function MemberRow({ caseId, member }: { caseId: string; member: TeamMemberItem }) {
  const [saveState, saveAction] = useFormState<ActionState, FormData>(saveTeamMemberAction, undefined);
  const [delState, delAction] = useFormState<ActionState, FormData>(deleteTeamMemberAction, undefined);
  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      <form action={saveAction} className="flex flex-wrap items-center gap-1">
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="memberId" value={member.id} />
        <input type="hidden" name="isRepresentative" value={member.is_representative ? 'true' : 'false'} />
        {member.is_representative && <Badge className="shrink-0">대표</Badge>}
        <Input name="name" defaultValue={member.name} className="h-8 w-24 text-xs" required placeholder="이름 *" />
        <Input name="memberRole" defaultValue={member.member_role ?? ''} className="h-8 w-24 text-xs" placeholder="역할 (기획 등)" />
        <Input name="phone" defaultValue={member.phone ?? ''} className="h-8 w-32 text-xs" placeholder="휴대폰" />
        <Input name="email" defaultValue={member.email ?? ''} className="h-8 w-40 text-xs" placeholder="이메일" />
        <Submit>저장</Submit>
        <StateLine state={saveState} />
      </form>
      <form action={delAction} onSubmit={(e) => { if (!confirm(`'${member.name}' 팀원을 삭제할까요? 이미 등록된 회차의 참가자 기록은 유지됩니다.`)) e.preventDefault(); }} className="flex items-center gap-1 self-end">
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="memberId" value={member.id} />
        <button type="submit" className="text-xs text-muted-foreground underline hover:text-destructive">삭제</button>
        <StateLine state={delState} />
      </form>
    </div>
  );
}

function AddMemberForm({ caseId }: { caseId: string }) {
  const [state, action] = useFormState<ActionState, FormData>(saveTeamMemberAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [rep, setRep] = useState(false);
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setRep(false);
    }
  }, [state]);
  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-1 rounded-md border border-dashed p-2">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="isRepresentative" value={rep ? 'true' : 'false'} />
      <button
        type="button"
        onClick={() => setRep((v) => !v)}
        className={`rounded-full border px-2 py-0.5 text-xs ${rep ? 'border-primary bg-primary/10 font-semibold text-primary' : 'text-muted-foreground'}`}
        title="팀 대표 표시"
      >
        대표
      </button>
      <Input name="name" className="h-8 w-24 text-xs" required placeholder="이름 *" />
      <Input name="memberRole" className="h-8 w-24 text-xs" placeholder="역할 (개발 등)" />
      <Input name="phone" className="h-8 w-32 text-xs" placeholder="휴대폰 (선택)" />
      <Input name="email" className="h-8 w-40 text-xs" placeholder="이메일 (선택)" />
      <Submit>팀원 추가</Submit>
      <StateLine state={state} />
    </form>
  );
}

/**
 * 팀 정보 패널 (운영사) — 아이템명·아이템 설명 + 팀원 명단.
 * 팀원은 멘토가 회차 등록 시 참가자로 선택할 수 있다 (팀 대표가 아닌 팀원의 멘토링 참여).
 */
export function TeamPanel({ caseId, item, itemDescription, members }: {
  caseId: string;
  item: string | null;
  itemDescription: string | null;
  members: TeamMemberItem[];
}) {
  const [infoState, infoAction] = useFormState<ActionState, FormData>(saveTeamInfoAction, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> 팀 정보</CardTitle>
        <CardDescription>
          아이템과 팀원 명단입니다. 등록된 팀원은 멘토가 회차 참가자로 선택할 수 있습니다 (팀 대표가 아닌 팀원의 참여 기록).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={infoAction} className="flex flex-col gap-2">
          <input type="hidden" name="caseId" value={caseId} />
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <div className="flex flex-col gap-1">
              <Label htmlFor="team-item" className="text-xs">아이템명</Label>
              <Input id="team-item" name="item" defaultValue={item ?? ''} className="h-8 text-sm" placeholder="예: 반려동물 헬스케어 앱" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="team-itemdesc" className="text-xs">아이템 설명</Label>
              <Textarea id="team-itemdesc" name="itemDescription" defaultValue={itemDescription ?? ''} rows={2} className="text-sm" placeholder="아이템·서비스에 대한 설명" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Submit>아이템 정보 저장</Submit>
            <StateLine state={infoState} />
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">팀원 ({members.length}명)</p>
          {members.map((m) => (
            <MemberRow key={m.id} caseId={caseId} member={m} />
          ))}
          <AddMemberForm caseId={caseId} />
        </div>
      </CardContent>
    </Card>
  );
}
