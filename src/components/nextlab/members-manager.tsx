'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';

import {
  createMemberAction,
  addExistingMemberAction,
  setMemberRoleAction,
  updateMemberDetailsAction,
  removeMemberFromProgramAction,
  setMemberActiveAction,
  resetMemberPasswordAction,
  deleteMemberAction,
  addRosterColumnAction,
  deleteRosterColumnAction,
  setRosterValueAction,
  sendLoginGuideAction,
  type MemberActionState,
} from '@/lib/auth/member-actions';
import { ROLE_LABELS, type UserRole } from '@/lib/auth/roles';
import { GRADE_LABELS, STAFF_GRADES, type StaffGrade } from '@/lib/auth/capabilities';
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
  /** 이 행사 안에서의 역할 (program_members.role) */
  role: UserRole;
  /** 계정 기본 역할 (users.role) — 다르면 배지로 표시 */
  primaryRole: UserRole;
  /** 이 행사 소속 활성 여부 */
  memberActive: boolean;
  is_active: boolean;
  must_change_password: boolean;
  position: string | null;
  grade: string | null;
  duty: string | null;
  /** 소속 (멘토 회사·기관 / 멘티는 기업(팀)명 폴백) */
  organization: string | null;
  /** 멘토: 활성 배정 멘티 수 (0 = Pool 대기) */
  assignedCount: number;
  /** 로그인 안내 문자 최초 발송 일시 */
  guideSentAt: string | null;
}

export interface RosterColumnItem {
  id: string;
  target: UserRole;
  name: string;
}

const ALL_ROLES: UserRole[] = ['institution', 'nextlab', 'mentor', 'mentee'];

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
          발주처 담당자 · 운영사 · 멘토 계정을 발급합니다. 멘티는 케이스 등록 후 초대됩니다. 멘토는 발급 시 <b>Pool(배정 대기)</b> 상태이며, 멘티에게 배정되면 그 멘티에 대해 확정됩니다.
          <br />
          <span className="text-primary">임시 비밀번호는 입력한 휴대폰 번호(숫자)로 발급되며, 첫 로그인 시 변경해야 합니다. 등록 후 아래 명단에서 [로그인 안내 문자]를 보낼 수 있습니다.</span>
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-organization">소속 <span className="text-xs font-normal text-muted-foreground">(회사·기관·부서)</span></Label>
              <Input id="m-organization" name="organization" autoComplete="off" placeholder="예: ○○컨설팅" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-position">직위 <span className="text-xs font-normal text-muted-foreground">(발주처·운영사 필수)</span></Label>
              <Input id="m-position" name="position" autoComplete="off" placeholder="예: 팀장, 주임" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-grade">운영사 등급 <span className="text-xs font-normal text-muted-foreground">(운영사 역할일 때)</span></Label>
              <select id="m-grade" name="grade" defaultValue="pl" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {STAFF_GRADES.map((g) => (
                  <option key={g} value={g}>{GRADE_LABELS[g]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-duty">이 행사에서의 담당역할</Label>
              <Input id="m-duty" name="duty" autoComplete="off" placeholder="예: 정산 담당, A·B그룹 담당" />
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

function AddExistingMemberForm() {
  const [state, action] = useFormState<MemberActionState, FormData>(addExistingMemberAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">기존 계정을 이 행사에 추가</CardTitle>
        <CardDescription>
          다른 행사에서 이미 쓰는 계정을 이 행사에 소속시킵니다. 역할은 행사마다 따로 정합니다(예: 다른 행사의 멘토를 이 행사에서는 멘티로). 새 계정은 만들지 않습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={action} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ex-identifier">이메일 · 휴대폰 · 멘티 아이디</Label>
              <Input id="ex-identifier" name="identifier" required autoComplete="off" placeholder="example@domain.com" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ex-role">이 행사에서의 역할</Label>
              <select id="ex-role" name="role" required defaultValue="mentee" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <RowSubmit>행사에 추가</RowSubmit>
            </div>
          </div>
          {state?.ok === false && <p className="text-sm font-medium text-destructive" role="alert">{state.error}</p>}
          {state?.ok && <p className="text-sm font-medium text-status-approved">{state.message}</p>}
          <p className="text-xs text-muted-foreground">멘티로 추가한 뒤에는 멘티 등록 화면에서 이 계정을 케이스에 연결하세요. 케이스 등록 시 자동 발급된 멘티 계정은 이미 소속되어 있습니다.</p>
        </form>
      </CardContent>
    </Card>
  );
}

/** 확장 편집 패널 — 이름·연락처·이메일·소속과 담당자의 직위·등급·담당역할을 함께 수정 */
function MemberDetailsForm({ member }: { member: MemberItem }) {
  const [state, action] = useFormState<MemberActionState, FormData>(updateMemberDetailsAction, undefined);
  const staff = member.role === 'nextlab' || member.role === 'institution';
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={member.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor={`ed-name-${member.id}`}>이름</Label>
          <Input id={`ed-name-${member.id}`} name="name" defaultValue={member.name} className="h-8 text-xs" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor={`ed-phone-${member.id}`}>휴대폰</Label>
          <Input id={`ed-phone-${member.id}`} name="phone" defaultValue={member.phone ?? ''} className="h-8 text-xs" placeholder="010-0000-0000" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor={`ed-email-${member.id}`}>이메일 (로그인 아이디)</Label>
          <Input id={`ed-email-${member.id}`} name="email" type="email" defaultValue={member.email ?? ''} className="h-8 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor={`ed-org-${member.id}`}>소속</Label>
          <Input id={`ed-org-${member.id}`} name="organization" defaultValue={member.organization ?? ''} className="h-8 text-xs" placeholder="회사·기관·부서" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor={`ed-pos-${member.id}`}>직위{staff ? ' *' : ''}</Label>
          <Input id={`ed-pos-${member.id}`} name="position" defaultValue={member.position ?? ''} className="h-8 text-xs" placeholder="예: 팀장" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs" htmlFor={`ed-duty-${member.id}`}>담당역할</Label>
          <Input id={`ed-duty-${member.id}`} name="duty" defaultValue={member.duty ?? ''} className="h-8 text-xs" placeholder="이 행사에서의 담당" />
        </div>
        {member.role === 'nextlab' && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`ed-grade-${member.id}`}>운영사 등급</Label>
            <select id={`ed-grade-${member.id}`} name="grade" defaultValue={(member.grade as StaffGrade | null) ?? 'pl'} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              {STAFF_GRADES.map((g) => (
                <option key={g} value={g}>{GRADE_LABELS[g]}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <RowSubmit>정보 저장</RowSubmit>
        {state?.ok === false && <span className="text-xs text-destructive">{state.error}</span>}
        {state?.ok && <span className="text-xs text-status-approved">{state.message}</span>}
      </div>
    </form>
  );
}

function RoleSelectForm({ member }: { member: MemberItem }) {
  const [state, action] = useFormState<MemberActionState, FormData>(setMemberRoleAction, undefined);
  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="userId" value={member.id} />
      <select name="role" defaultValue={member.role} className="h-8 rounded-md border border-input bg-background px-2 text-xs" title="이 행사에서의 역할">
        {ALL_ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      <RowSubmit>역할 변경</RowSubmit>
      {state?.ok === false && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}

function RemoveFromProgramForm({ member }: { member: MemberItem }) {
  const [state, action] = useFormState<MemberActionState, FormData>(removeMemberFromProgramAction, undefined);
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(`${member.name} 님의 이 행사 소속을 해제할까요? 계정과 다른 행사 활동은 유지됩니다.`)) e.preventDefault(); }}>
      <input type="hidden" name="userId" value={member.id} />
      <RowSubmit variant="outline">소속 해제</RowSubmit>
      {state?.ok === false && <span className="ml-1 text-xs text-destructive">{state.error}</span>}
    </form>
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
    <div className="flex flex-col items-start gap-2">
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
    <div className="flex flex-col items-start gap-1">
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
        <p className="max-w-[220px] text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}

/** 임의 컬럼 셀 — 입력 후 포커스가 빠지면 저장 (변경 시에만) */
function RosterValueCell({ columnId, userId, value }: { columnId: string; userId: string; value: string }) {
  const [state, action] = useFormState<MemberActionState, FormData>(setRosterValueAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  return (
    <form ref={formRef} action={action} className="flex items-center gap-1">
      <input type="hidden" name="columnId" value={columnId} />
      <input type="hidden" name="userId" value={userId} />
      <Input
        name="value"
        defaultValue={value}
        className="h-7 w-24 text-xs"
        placeholder="-"
        onChange={() => setDirty(true)}
        onBlur={() => {
          if (dirty) {
            formRef.current?.requestSubmit();
            setDirty(false);
          }
        }}
      />
      {state?.ok === false && <span className="text-[10px] text-destructive">{state.error}</span>}
    </form>
  );
}

/** 임의 컬럼 관리 (멘티·멘토 탭에서만) — 추가/삭제 */
function RosterColumnManager({ target, columns }: { target: UserRole; columns: RosterColumnItem[] }) {
  const [addState, addAction] = useFormState<MemberActionState, FormData>(addRosterColumnAction, undefined);
  const [delState, delAction] = useFormState<MemberActionState, FormData>(deleteRosterColumnAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (addState?.ok) formRef.current?.reset();
  }, [addState]);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">임의 컬럼(카테고리 마크)</span>
      {columns.map((c) => (
        <form
          key={c.id}
          action={delAction}
          onSubmit={(e) => { if (!confirm(`'${c.name}' 컬럼을 삭제할까요? 입력된 마크도 함께 삭제됩니다.`)) e.preventDefault(); }}
          className="inline-flex"
        >
          <input type="hidden" name="columnId" value={c.id} />
          <Badge variant="secondary" className="gap-1 font-normal">
            {c.name}
            <button type="submit" className="text-muted-foreground hover:text-destructive" title="컬럼 삭제" aria-label={`${c.name} 컬럼 삭제`}>×</button>
          </Badge>
        </form>
      ))}
      <form ref={formRef} action={addAction} className="inline-flex items-center gap-1">
        <input type="hidden" name="target" value={target} />
        <Input name="name" className="h-7 w-32 text-xs" placeholder="새 컬럼 이름" required maxLength={30} />
        <RowSubmit>추가</RowSubmit>
      </form>
      {(addState?.ok === false || delState?.ok === false) && (
        <span className="text-xs text-destructive">{addState?.ok === false ? addState.error : delState?.ok === false ? delState.error : ''}</span>
      )}
    </div>
  );
}

/** 선택 회원 로그인 안내 문자 발송 바 */
function LoginGuideBar({ selected, onDone }: { selected: MemberItem[]; onDone: () => void }) {
  const [state, action] = useFormState<MemberActionState, FormData>(sendLoginGuideAction, undefined);
  const [showMessage, setShowMessage] = useState(false);
  const lastState = useRef<MemberActionState>(undefined);
  useEffect(() => {
    if (state !== lastState.current && state?.ok) onDone();
    lastState.current = state;
  }, [state, onDone]);
  const noPhone = selected.filter((m) => ((m.phone ?? '').replace(/\D/g, '').length < 10) || !m.is_active).length;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="userIds" value={JSON.stringify(selected.map((m) => m.id))} />
        <span className="text-sm font-medium">{selected.length}명 선택됨{noPhone > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">(휴대폰 없음·비활성 {noPhone}명 제외)</span>}</span>
        <RowSubmit>로그인 안내 문자 발송</RowSubmit>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowMessage((v) => !v)}>
          {showMessage ? '기본 문구 사용' : '문구 직접 쓰기'}
        </button>
        {showMessage && (
          <textarea
            name="message"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            placeholder={'첫 줄 문구를 직접 씁니다. {name} 은 회원 이름으로 바뀝니다. 로그인 주소·아이디 안내는 자동으로 뒤에 붙습니다.'}
          />
        )}
      </form>
      <p className="text-[11px] text-muted-foreground">
        안내 문자에는 로그인 주소와 아이디(이메일·휴대폰), 비밀번호 미변경 회원에게는 임시 비밀번호 안내(휴대폰 번호)가 포함됩니다. 행사 문자 API 가 등록돼 있으면 그 발신번호로 발송됩니다.
      </p>
      {state?.ok === false && <p className="text-xs font-medium text-destructive">{state.error}</p>}
      {state?.ok && <p className="text-xs font-medium text-status-approved">{state.message}</p>}
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

export function MembersManager({
  members,
  rosterColumns,
  rosterValues,
}: {
  members: MemberItem[];
  rosterColumns: RosterColumnItem[];
  rosterValues: Record<string, string>;
}) {
  const [tab, setTab] = useState<MemberTab>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const activeTab = MEMBER_TABS.find((t) => t.key === tab) ?? MEMBER_TABS[0]!;
  const filtered = members.filter((m) => activeTab.match(m.role));
  const tabColumns = useMemo(
    () => (tab === 'mentor' || tab === 'mentee' ? rosterColumns.filter((c) => c.target === tab) : []),
    [tab, rosterColumns],
  );
  const selectedMembers = filtered.filter((m) => selected.has(m.id));
  const allChecked = filtered.length > 0 && filtered.every((m) => selected.has(m.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) filtered.forEach((m) => next.delete(m.id));
      else filtered.forEach((m) => next.add(m.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const colSpan = 6 + tabColumns.length + 1;

  return (
    <div className="flex flex-col gap-6">
      <CreateMemberForm />
      <AddExistingMemberForm />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1 border-b">
          {MEMBER_TABS.map((t) => {
            const count = members.filter((m) => t.match(m.role)).length;
            const isActive = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTab(t.key); setEditing(null); }}
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

        {(tab === 'mentor' || tab === 'mentee') && (
          <RosterColumnManager target={tab} columns={tabColumns} />
        )}

        {selectedMembers.length > 0 && (
          <LoginGuideBar selected={selectedMembers} onDone={() => setSelected(new Set())} />
        )}

        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="전체 선택" />
                </TableHead>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>소속</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>상태</TableHead>
                {tabColumns.map((c) => (
                  <TableHead key={c.id} className="whitespace-nowrap text-xs">{c.name}</TableHead>
                ))}
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-muted-foreground">
                    해당 구분의 회원이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => (
                  <Fragment key={m.id}>
                    <TableRow>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(m.id)}
                          onChange={() => toggleOne(m.id)}
                          aria-label={`${m.name} 선택`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.name}
                        {m.phone && (
                          <span className="ml-1 text-xs text-muted-foreground">· {m.phone}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.email ?? '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[m.organization, m.position].filter(Boolean).join(' · ') || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="secondary">
                            {ROLE_LABELS[m.role]}
                            {m.role === 'nextlab' && <span className="ml-1 font-normal text-muted-foreground">· {GRADE_LABELS[(m.grade as StaffGrade | null) ?? 'pl']}</span>}
                          </Badge>
                          {m.role === 'mentor' && (
                            m.assignedCount > 0 ? (
                              <Badge className="bg-status-approved/15 text-status-approved" title="배정된 멘티에 대해 확정된 멘토입니다.">확정 · 멘티 {m.assignedCount}</Badge>
                            ) : (
                              <Badge variant="outline" title="아직 멘티가 배정되지 않은 Pool(대기) 멘토입니다. 배정되면 그 멘티에 대해 확정됩니다.">Pool 대기</Badge>
                            )
                          )}
                          {m.duty && <span className="text-[11px] text-muted-foreground">{m.duty}</span>}
                          {m.primaryRole !== m.role && (
                            <span className="text-[10px] text-violet-700" title="계정 기본 역할과 다름 — 다른 행사에서는 이 역할로 활동">기본 {ROLE_LABELS[m.primaryRole]}</span>
                          )}
                          {!m.memberActive && <span className="text-[10px] text-muted-foreground">소속 해제됨</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
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
                          <span className="text-[10px] text-muted-foreground">
                            {m.guideSentAt ? `안내 발송 ${new Date(m.guideSentAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}` : '안내 미발송'}
                          </span>
                        </div>
                      </TableCell>
                      {tabColumns.map((c) => (
                        <TableCell key={c.id}>
                          <RosterValueCell columnId={c.id} userId={m.id} value={rosterValues[`${c.id}:${m.id}`] ?? ''} />
                        </TableCell>
                      ))}
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
                          <Button
                            size="sm"
                            variant={editing === m.id ? 'default' : 'outline'}
                            onClick={() => setEditing((v) => (v === m.id ? null : m.id))}
                          >
                            {editing === m.id ? '닫기' : '정보 수정'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {editing === m.id && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={colSpan} className="p-4">
                          <div className="flex flex-col gap-4">
                            <MemberDetailsForm member={m} />
                            <div className="flex flex-wrap items-start gap-2 border-t pt-3">
                              <RoleSelectForm member={m} />
                              {m.memberActive && <RemoveFromProgramForm member={m} />}
                              <ToggleActiveForm member={m} />
                              <ResetPasswordForm member={m} />
                              <DeleteMemberForm member={m} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
