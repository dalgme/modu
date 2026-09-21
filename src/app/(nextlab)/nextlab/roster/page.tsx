import Link from 'next/link';
import { Download } from 'lucide-react';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listProgramMembers } from '@/lib/data/members';
import { listRosterColumns } from '@/lib/data/roster-columns';
import { listCases } from '@/lib/data/cases';
import { listProgramMentors } from '@/lib/data/mentors';
import { listSupportTypes } from '@/lib/programs/data';
import { getMentorFormStatus } from '@/lib/mentor-forms/data';
import { featureEnabled } from '@/lib/platform/features';
import { denyUnless } from '@/lib/auth/capabilities';
import { CASE_STATUS_META } from '@/types/case-status';
import { MembersManager, CreateMemberForm, AddExistingMemberForm, type MenteeProgressItem } from '@/components/nextlab/members-manager';
import { MentorsRoster } from '@/components/nextlab/mentors-roster';
import { MentorFormsStatus } from '@/components/nextlab/mentor-forms-status';
import { BulkImportPanel } from '@/components/nextlab/bulk-import-panel';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'mentee', label: '멘티 명단' },
  { key: 'mentor', label: '멘토 명단' },
  { key: 'staff', label: '관리자 명단' },
  { key: 'register', label: '회원 등록' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const REG_ROLES = [
  { key: 'mentee', label: '멘티' },
  { key: 'mentor', label: '멘토' },
  { key: 'nextlab', label: '운영사' },
  { key: 'institution', label: '발주처' },
] as const;
type RegKey = (typeof REG_ROLES)[number]['key'];

/** 활성/비활성의 의미와 전환 방법 안내 (모든 명단 미니탭 상단) */
function ActiveHelp() {
  return (
    <div className="rounded-lg border border-sky-300 bg-sky-50/60 px-4 py-3 text-xs leading-relaxed text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
      <b>활성 / 비활성이란?</b> <b>활성</b> = 로그인과 행사 참여가 가능한 상태. <b>비활성</b> = 로그인이 차단된 상태(멘티 포기·중도 이탈 등) — 명단과 이력은 유지되며 진행현황에 <b className="text-destructive">비활성화</b>로 표시됩니다.
      전환 방법: 각 회원 행의 <b>[정보 수정]</b> 을 열고 <b>[비활성화]/[활성화]</b> 버튼을 누르세요. (행사 소속만 빼려면 [소속 해제])
    </div>
  );
}

/** 회원 명단 — 멘티/멘토/관리자 명단 + 회원 등록 (P20) */
export default async function Page({ searchParams }: { searchParams: { tab?: string; reg?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab = (TABS.find((t) => t.key === searchParams.tab)?.key ?? 'mentee') as TabKey;
  const reg = (REG_ROLES.find((r) => r.key === searchParams.reg)?.key ?? 'mentee') as RegKey;

  const [members, roster] = await Promise.all([
    listProgramMembers(ctx.programId),
    listRosterColumns(ctx.programId),
  ]);
  const memberItems = members.map((m) => ({
    id: m.id,
    email: m.email,
    name: m.name,
    phone: m.phone,
    role: m.role,
    primaryRole: m.primaryRole,
    memberActive: m.memberActive,
    position: m.position,
    grade: m.grade,
    duty: m.duty,
    organization: m.organization,
    assignedCount: m.assignedCount,
    guideSentAt: m.guideSentAt,
    is_active: m.is_active,
    must_change_password: m.must_change_password,
  }));

  let body: React.ReactNode = null;

  if (tab === 'mentee') {
    const cases = await listCases({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
    const progress: Record<string, MenteeProgressItem[]> = {};
    for (const c of cases) {
      if (!c.mentee_id) continue;
      (progress[c.mentee_id] ??= []).push({
        caseId: c.id,
        groupName: c.supportTypeName,
        statusLabel: CASE_STATUS_META[c.status].short,
        withdrawn: c.status === 'withdrawn',
        roundsDone: c.roundsDone,
        requiredRounds: c.requiredRounds,
        mentorName: c.mentorName,
      });
    }
    body = (
      <>
        <ActiveHelp />
        <MembersManager members={memberItems} rosterColumns={roster.columns.map((c) => ({ id: c.id, target: c.target, name: c.name }))} rosterValues={roster.values} mode="mentee" progress={progress} />
      </>
    );
  }

  if (tab === 'mentor') {
    const [mentors, groups, formStatus] = await Promise.all([
      listProgramMentors(ctx.programId, ctx.supportTypeId ?? null),
      listSupportTypes(ctx.programId),
      featureEnabled(ctx.program.features, 'mentor_forms')
        ? getMentorFormStatus(ctx.programId, denyUnless(ctx, 'members.sensitive') === null)
        : Promise.resolve([]),
    ]);
    body = (
      <>
        <ActiveHelp />
        {formStatus.length > 0 && (
          <MentorFormsStatus
            items={formStatus.map((f) => ({
              formKey: f.formKey,
              method: f.method,
              title: f.title,
              submitted: f.submitted.map((s) => ({
                id: s.id,
                mentorName: s.mentorName,
                method: s.method,
                submittedAt: s.submittedAt,
                signedName: s.signedName,
                answers: s.answers,
                contentSnapshot: s.contentSnapshot,
                fileName: s.fileName,
                fileUrl: s.fileUrl,
                rrn: s.rrn,
              })),
              missing: f.missing,
            }))}
          />
        )}
        <div>
          <h2 className="text-lg font-semibold">멘토별 진행현황 · 지급서류</h2>
          <p className="text-xs text-muted-foreground">담당 멘티 · 이행 회차 · 확정 실지급 · 지급서류(이력서·통장사본·신분증사본) · 그룹별 원천징수 · 운영사 평가. 지급서류 체크는 비밀번호 재인증이 필요합니다.</p>
        </div>
        <MentorsRoster mentors={mentors} groups={groups.map((g) => ({ id: g.id, name: g.name }))} />
        <div>
          <h2 className="text-lg font-semibold">멘토 계정 관리</h2>
          <p className="text-xs text-muted-foreground">정보 수정 · 역할 변경 · 활성/비활성 · 로그인 안내 문자 · 화면 보기(대행)</p>
        </div>
        <MembersManager members={memberItems} rosterColumns={roster.columns.map((c) => ({ id: c.id, target: c.target, name: c.name }))} rosterValues={roster.values} mode="mentor" />
      </>
    );
  }

  if (tab === 'staff') {
    body = (
      <>
        <ActiveHelp />
        <p className="text-sm text-muted-foreground">운영사 담당자와 발주처 담당자를 관리합니다. 등급(PL/PM/부PM/옵저버)·직위·담당역할은 [정보 수정]에서 바꿉니다.</p>
        <MembersManager members={memberItems} rosterColumns={[]} rosterValues={{}} mode="staff" />
      </>
    );
  }

  if (tab === 'register') {
    const groups = await listSupportTypes(ctx.programId);
    const groupOpts = groups.filter((g) => g.status === 'active').map((g) => ({ code: g.code, name: g.name }));
    body = (
      <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
        {/* 좌측 세로 메뉴 — 자격별 등록 */}
        <nav className="flex h-fit flex-row gap-1 overflow-x-auto rounded-xl border bg-background p-2 lg:flex-col">
          {REG_ROLES.map((r) => (
            <Link
              key={r.key}
              href={`/nextlab/roster?tab=register&reg=${r.key}`}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${reg === r.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              {r.label} 등록
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-5">
          {reg === 'mentee' ? (
            <div className="flex flex-col gap-3 rounded-xl border bg-background p-4">
              <p className="text-sm">
                멘티 개별 등록은 <b>멘티 등록 폼</b>(케이스 생성)에서 합니다 — 기업(팀)명·사업그룹·팀 정보 등 멘티 전용 컬럼을 입력하고, 계정이 자동 발급·연결됩니다.
              </p>
              <div>
                <Button asChild>
                  <Link href="/nextlab/cases/new">멘티 개별 등록 폼 열기</Link>
                </Button>
              </div>
            </div>
          ) : (
            <CreateMemberForm fixedRole={reg} />
          )}
          <BulkImportPanel groups={groupOpts} fixedKind={reg} />
          <AddExistingMemberForm />
        </div>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">회원 명단</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <b>{ctx.program.name}</b>{ctx.group ? ` · ${ctx.group.name}` : ''} — 역할은 이 행사 안에서의 역할입니다. 회원 정보를 수정하면 명단·진행현황·문서에 즉시 반영됩니다.
          </p>
        </div>
        {tab !== 'register' && (
          <Button asChild variant="outline" className="gap-1">
            <a href={`/api/nextlab/roster-export?tab=${tab}`}>
              <Download className="h-4 w-4" /> 엑셀 다운로드
            </a>
          </Button>
        )}
      </div>
      <nav className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/nextlab/roster?tab=${t.key}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </main>
  );
}
