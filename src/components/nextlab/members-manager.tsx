'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { openCaseSurveyAction } from '@/lib/surveys/satisfaction-actions';
import { useToast } from '@/hooks/use-toast';

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
import { MentorName } from '@/components/common/mentor-name';
import { RoundDots } from '@/components/common/round-dots';
import { MentorGroupControls, type MentorGroupInfo } from '@/components/nextlab/mentor-group-controls';
import { RankBadge } from '@/components/nextlab/matching-lists';
import { Search } from 'lucide-react';
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
  /** 비고 (발주처·운영사·멘토) */
  note: string | null;
  /** 멘티: 순위 (여러 케이스면 가장 앞선 순위, P27-01) */
  rank?: number | null;
  /** 멘토: 그룹 지정·원천징수 (정보 수정 패널, P27-14) */
  mentorGroups?: MentorGroupInfo[];
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
      <p className="font-medium text-primary">임시 비밀번호 (= 본인 휴대폰 번호 숫자만 · 최초 로그인 시 변경)</p>
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

/** 회원 계정 발급 폼 — fixedRole 을 주면 그 역할 전용(역할 선택 숨김, 해당 역할 컬럼만) */
export function CreateMemberForm({ fixedRole }: { fixedRole?: UserRole }) {
  const [state, action] = useFormState<MemberActionState, FormData>(createMemberAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  // 발급 성공 시 입력 폼을 빈칸으로 리셋 (임시비번 안내는 state 로 유지)
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const showGrade = !fixedRole || fixedRole === 'nextlab';
  const staffOnly = fixedRole === 'nextlab' || fixedRole === 'institution';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{fixedRole ? `${ROLE_LABELS[fixedRole]} 개별 등록` : '회원 계정 발급'}</CardTitle>
        <CardDescription>
          {fixedRole === 'mentor'
            ? <>멘토는 등록 시 <b>미배정(배정 대기)</b> 상태이며, 멘티에게 배정되면 그 멘티에 대해 확정됩니다.</>
            : fixedRole
              ? <>{ROLE_LABELS[fixedRole]} 담당자 계정을 발급합니다.</>
              : <>발주처 담당자 · 운영사 · 멘토 계정을 발급합니다. 멘티는 케이스 등록 후 초대됩니다.</>}
          <br />
          <span className="text-primary">임시 비밀번호는 입력한 휴대폰 번호(숫자)로 발급되며, 첫 로그인 시 변경해야 합니다. 등록 후 명단에서 [로그인 안내 문자]를 보낼 수 있습니다.</span>
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
                type="tel"
                inputMode="tel"
                required
                autoComplete="off"
                placeholder="010-0000-0000"
              />
            </div>
            {fixedRole ? (
              <input type="hidden" name="role" value={fixedRole} />
            ) : (
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
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-organization">소속 <span className="text-xs font-normal text-muted-foreground">(회사·기관·부서)</span></Label>
              <Input id="m-organization" name="organization" autoComplete="off" placeholder="예: ○○컨설팅" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="m-position">직위 <span className="text-xs font-normal text-muted-foreground">{staffOnly ? '(필수)' : '(발주처·운영사 필수)'}</span></Label>
              <Input id="m-position" name="position" autoComplete="off" placeholder="예: 팀장, 주임" required={staffOnly} />
            </div>
            {showGrade && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="m-grade">운영사 등급 <span className="text-xs font-normal text-muted-foreground">(운영사 역할일 때)</span></Label>
                <select id="m-grade" name="grade" defaultValue="pl" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {STAFF_GRADES.map((g) => (
                    <option key={g} value={g}>{GRADE_LABELS[g]}</option>
                  ))}
                </select>
              </div>
            )}
            {(!fixedRole || fixedRole === 'nextlab') && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="m-duty">이 행사에서의 담당역할 <span className="text-xs font-normal text-muted-foreground">(운영사 담당자만)</span></Label>
                <Input id="m-duty" name="duty" autoComplete="off" placeholder="예: 정산 담당, A·B그룹 담당" />
              </div>
            )}
            {staffOnly && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="m-staff-note">비고</Label>
                <Input id="m-staff-note" name="note" autoComplete="off" />
              </div>
            )}
            {fixedRole === 'mentor' && (
              <>
                {/* P23 멘토 컬럼: 분야·소속멘토기관·권역·비고 (멘토 프로필에 저장) */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="m-expertise">분야 <span className="text-xs font-normal text-muted-foreground">(콤마 구분, 최대 10개)</span></Label>
                  <Input id="m-expertise" name="expertise" autoComplete="off" placeholder="예: 마케팅, 재무, 투자유치" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="m-institution">소속멘토기관</Label>
                  <Input id="m-institution" name="mentor_institution" autoComplete="off" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="m-region">권역</Label>
                  <Input id="m-region" name="region" autoComplete="off" placeholder="예: 세종" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="m-note">비고</Label>
                  <Input id="m-note" name="note" autoComplete="off" />
                </div>
              </>
            )}
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

export function AddExistingMemberForm() {
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
          이미 계정이 있는 사람(다른 행사에서 등록된 멘토·멘티·담당자)을 이 행사에 소속시킵니다. 이메일이나 휴대폰으로 찾고 이 행사에서의 역할을 정합니다. 새 계정은 만들지 않으며, 처음 등록하는 사람은 위 [회원 등록]을 쓰세요.
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
          <Input id={`ed-phone-${member.id}`} name="phone" type="tel" inputMode="tel" defaultValue={member.phone ?? ''} className="h-8 text-xs" placeholder="010-0000-0000" />
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
        {member.role === 'nextlab' && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`ed-duty-${member.id}`}>담당역할</Label>
            <Input id={`ed-duty-${member.id}`} name="duty" defaultValue={member.duty ?? ''} className="h-8 text-xs" placeholder="이 행사에서의 담당" />
          </div>
        )}
        {member.role !== 'mentee' && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs" htmlFor={`ed-note-${member.id}`}>비고</Label>
            <Input id={`ed-note-${member.id}`} name="note" defaultValue={member.note ?? ''} className="h-8 text-xs" />
          </div>
        )}
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
      {member.role === 'mentor' && member.mentorGroups && member.mentorGroups.length > 0 && (
        <MentorGroupControls userId={member.id} mentorName={member.name} groups={member.mentorGroups} />
      )}
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
    <form
      action={action}
      onSubmit={(e) => {
        if (member.is_active && !window.confirm(`${member.name} 회원을 비활성화합니다. 로그인이 막히고 명단·진행현황에 '비활성화'로 표시됩니다(데이터는 유지, 다시 활성화 가능). 계속할까요?`)) e.preventDefault();
      }}
    >
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

export type MemberMode = 'staff' | 'mentor' | 'mentee';

const MODE_MATCH: Record<MemberMode, (r: UserRole) => boolean> = {
  staff: (r) => r === 'institution' || r === 'nextlab',
  mentor: (r) => r === 'mentor',
  mentee: (r) => r === 'mentee',
};

/** 멘티 진행현황 요약 (케이스 단위 — 승계로 여러 건일 수 있음) */
export interface MenteeProgressItem {
  caseId: string;
  groupName: string | null;
  statusLabel: string;
  withdrawn: boolean;
  roundsDone: number;
  requiredRounds: number;
  mentorId: string | null;
  mentorName: string | null;
  mentorActiveCount: number;
  /** 만족도 조사 — none: 미개시 / open: 개시(응답 대기) / done: 응답 완료 */
  surveyStatus: 'none' | 'open' | 'done';
  /** 진행 단계 순서값 (CASE_STATUSES 인덱스) — 진행현황 정렬용 (P27-02) */
  statusIndex: number;
}

/** [만족도 생성] / 진행중 / 완료 표시 (P20) */
function SurveyControl({ item }: { item: MenteeProgressItem }) {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();
  if (item.surveyStatus === 'done') {
    return <Badge className="w-fit bg-status-approved/15 text-[10px] text-status-approved">만족도 완료</Badge>;
  }
  if (item.surveyStatus === 'open') {
    return <Badge variant="outline" className="w-fit text-[10px] text-sky-700" title="멘티에게 만족도 조사가 노출 중입니다. 개시 1주일 미응답 시 자동 리마인드 문자가 발송됩니다.">만족도 진행중</Badge>;
  }
  if (item.withdrawn) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm('이 멘티에게 만족도 조사를 지금 열까요? 멘티 화면에 바로 노출됩니다.')) return;
        startTransition(async () => {
          const r = await openCaseSurveyAction(item.caseId);
          toast(r.ok ? { title: '만족도 조사를 열었습니다.' } : { title: r.error, variant: 'destructive' });
          if (r.ok) router.refresh();
        });
      }}
      className="w-fit rounded border border-primary/50 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
    >
      {pending ? '여는 중…' : '만족도 생성'}
    </button>
  );
}

export function MembersManager({
  members,
  rosterColumns,
  rosterValues,
  mode,
  progress,
}: {
  members: MemberItem[];
  rosterColumns: RosterColumnItem[];
  rosterValues: Record<string, string>;
  /** 미니탭 모드 — 명단 하나만 렌더한다 (회원 명단 탭에서 미니탭별로 사용) */
  mode: MemberMode;
  /** 멘티 모드: 회원 id → 진행현황 (수정 즉시 서버 재렌더로 반영) */
  progress?: Record<string, MenteeProgressItem[]>;
}) {
  const tab = mode;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // 멘티 명단 정렬 — 순위 / 이름(가나다) / 진행현황 (P27-02)
  const [sortKey, setSortKey] = useState<'rank' | 'name' | 'progress'>(mode === 'mentee' ? 'rank' : 'name');
  // 로그인 안내 미발송 회원만 보기 (P28)
  const [onlyUnsent, setOnlyUnsent] = useState(false);
  // 멘토 팝업 [명단에서 정보 수정] 링크(?edit=userId)로 들어오면 그 회원의 편집 패널을 바로 연다 (P28)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('edit');
    if (!id || !members.some((m) => m.id === id)) return;
    setEditing(id);
    window.setTimeout(() => document.getElementById(`member-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filtered = members
    .filter((m) => MODE_MATCH[mode](m.role))
    .filter((m) => !query.trim() || m.name.includes(query.trim()) || (m.phone ?? '').includes(query.trim()))
    .filter((m) => !onlyUnsent || !m.guideSentAt)
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, 'ko');
      if (mode !== 'mentee' || sortKey === 'name') return byName;
      if (sortKey === 'rank') return (a.rank ?? 1e9) - (b.rank ?? 1e9) || byName;
      const idx = (m: MemberItem) => Math.min(...((progress?.[m.id] ?? []).map((p) => p.statusIndex)), 1e9);
      return idx(a) - idx(b) || byName;
    });
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

  const showProgress = mode === 'mentee' && !!progress;
  const showRank = mode === 'mentee';
  const colSpan = 6 + (showRank ? 1 : 0) + (showProgress ? 2 : 0) + tabColumns.length + 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {(tab === 'mentor' || tab === 'mentee') && (
          <details className="rounded-md border border-dashed bg-muted/20">
            <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-muted-foreground">임의 컬럼(카테고리 마크) 관리{tabColumns.length ? ` · ${tabColumns.length}개` : ''}</summary>
            <RosterColumnManager target={tab} columns={tabColumns} />
          </details>
        )}

        {(tab === 'mentor' || tab === 'mentee') && (
          selectedMembers.length > 0 ? (
            <LoginGuideBar selected={selectedMembers} onDone={() => setSelected(new Set())} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span>
                <b className="text-foreground">로그인 안내 문자</b> — 왼쪽 체크박스로 회원을 선택하면 아이디·임시 비밀번호 안내 문자를 일괄 발송할 수 있습니다.
              </span>
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={onlyUnsent} onChange={(e) => setOnlyUnsent(e.target.checked)} className="h-3.5 w-3.5" />
                안내 미발송 회원만 보기
              </label>
            </div>
          )
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름·휴대폰 검색" className="h-9 w-52 pl-8" />
          </div>
          <span className="text-xs text-muted-foreground">{filtered.length}명</span>
          {mode === 'mentee' ? (
            <div className="ml-auto flex items-center gap-1 text-xs">
              <span className="text-muted-foreground">정렬</span>
              {([['rank', '멘티 순위'], ['name', '이름(가나다)'], ['progress', '진행현황']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setSortKey(k)} className={cn('rounded-full border px-2.5 py-1 font-semibold', sortKey === k ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent')}>{label}</button>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">· 가나다순</span>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="전체 선택" />
                </TableHead>
                {showRank && <TableHead className="whitespace-nowrap">순위</TableHead>}
                <TableHead>이름</TableHead>
                <TableHead className="whitespace-nowrap">이메일/핸드폰</TableHead>
                <TableHead className="hidden md:table-cell">소속</TableHead>
                <TableHead>역할</TableHead>
                <TableHead>상태</TableHead>
                {showProgress && <TableHead className="whitespace-nowrap">라운드 정보</TableHead>}
                {showProgress && <TableHead className="whitespace-nowrap">진행현황</TableHead>}
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
                    <TableRow id={`member-row-${m.id}`}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selected.has(m.id)}
                          onChange={() => toggleOne(m.id)}
                          aria-label={`${m.name} 선택`}
                        />
                      </TableCell>
                      {showRank && <TableCell><RankBadge rank={m.rank ?? null} /></TableCell>}
                      <TableCell className="whitespace-nowrap font-medium">
                        {m.role === 'mentor' ? <MentorName id={m.id} name={m.name} count={m.assignedCount} /> : m.name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <div>{m.email ?? '-'}</div>
                        <div>{m.phone ?? '-'}</div>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {[m.organization, m.position].filter(Boolean).join(' · ') || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="secondary" className="whitespace-nowrap">
                            {ROLE_LABELS[m.role]}
                            {m.role === 'nextlab' && <span className="ml-1 font-normal text-muted-foreground">· {GRADE_LABELS[(m.grade as StaffGrade | null) ?? 'pl']}</span>}
                          </Badge>
                          {m.role === 'nextlab' && m.duty && <span className="text-[11px] text-muted-foreground">{m.duty}</span>}
                          {m.note && <span className="text-[11px] text-muted-foreground" title="비고">비고: {m.note}</span>}
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
                      {showProgress && (
                        <TableCell className="whitespace-nowrap text-xs">
                          {(progress?.[m.id] ?? []).length === 0 ? (
                            <span className="text-muted-foreground">케이스 없음</span>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {(progress?.[m.id] ?? []).map((p) => (
                                <Link key={p.caseId} href={`/nextlab/cases/${p.caseId}`} className="hover:underline">{p.groupName ?? '-'}</Link>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      )}
                      {showProgress && (
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {!m.is_active && (
                              <Badge variant="destructive" className="w-fit text-[10px]" title="비활성 회원 — 진행현황에 비활성화로 표시됩니다.">비활성화</Badge>
                            )}
                            {(progress?.[m.id] ?? []).map((p) => (
                              <div key={p.caseId} className="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
                                <Link href={`/nextlab/cases/${p.caseId}`} className={cn('font-medium hover:underline', p.withdrawn && 'text-destructive')}>{p.withdrawn ? '중도 종료' : p.statusLabel}</Link>
                                <RoundDots done={p.roundsDone} required={p.requiredRounds} />
                                {p.mentorName && (
                                  <span className="text-muted-foreground">
                                    · <MentorName id={p.mentorId} name={p.mentorName} count={p.mentorActiveCount} className="text-[11px]" />
                                  </span>
                                )}
                                <SurveyControl item={p} />
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      )}
                      {tabColumns.map((c) => (
                        <TableCell key={c.id}>
                          <RosterValueCell columnId={c.id} userId={m.id} value={rosterValues[`${c.id}:${m.id}`] ?? ''} />
                        </TableCell>
                      ))}
                      <TableCell>
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          {/* 멘토·멘티는 '화면 보기' 가 곧 대행 시작 — 들어가서 바로 업무를 처리할 수 있어야 한다.
                              (열람만 하려면 대행 배너의 [대행 종료] 를 누르면 된다) */}
                          {(m.role === 'mentor' || m.role === 'mentee') && m.is_active ? (
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
