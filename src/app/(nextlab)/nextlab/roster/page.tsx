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
import { MembersManager, type MenteeProgressItem } from '@/components/nextlab/members-manager';
import { MentorsRoster } from '@/components/nextlab/mentors-roster';
import { MentorFormsStatus } from '@/components/nextlab/mentor-forms-status';
import { RegisterPanel, REG_ROLES, type RegKey } from '@/components/nextlab/register-panel';
import { ExcelButton } from '@/components/common/excel-button';
import { MenteeMatchList, MentorMatchList } from '@/components/nextlab/matching-lists';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
// 엑셀 일괄 등록(서버 액션이 이 라우트로 POST 된다) — 계정 발급이 행당 수백 ms 라 대량 업로드는 기본 제한을 넘긴다
export const maxDuration = 60;

const TABS = [
  { key: 'mentee', label: '멘티 명단' },
  { key: 'mentor', label: '멘토 명단' },
  { key: 'mentee-match', label: '멘티 매칭 리스트' },
  { key: 'mentor-match', label: '멘토 매칭 리스트' },
  { key: 'institution', label: '발주처' },
  { key: 'nextlab', label: '운영사' },
  { key: 'register', label: '회원 등록' },
] as const;
type TabKey = (typeof TABS)[number]['key'];


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
  // 구 '관리자 명단' 링크는 발주처 탭으로
  const tabParam = searchParams.tab === 'staff' ? 'institution' : searchParams.tab;
  const tab = (TABS.find((t) => t.key === tabParam)?.key ?? 'mentee') as TabKey;
  const reg = (REG_ROLES.find((r) => r.key === searchParams.reg)?.key ?? 'mentee') as RegKey;

  const [members, roster] = await Promise.all([
    listProgramMembers(ctx.programId, ctx.supportTypeId),
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
    note: m.note,
    is_active: m.is_active,
    must_change_password: m.must_change_password,
  }));

  // 탭별 등록 인원 수 (행사 안 역할 기준) — 등록 직후 revalidate 로 즉시 갱신된다
  const countOf = (role: string) => members.filter((m) => m.role === role).length;
  const tabCounts: Partial<Record<TabKey, number>> = {
    mentee: countOf('mentee'),
    mentor: countOf('mentor'),
    institution: countOf('institution'),
    nextlab: countOf('nextlab'),
  };

  let body: React.ReactNode = null;

  if (tab === 'mentee') {
    const cases = await listCases({ programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data: responses } = cases.length
      ? await createAdminClient().from('survey_responses').select('case_id').in('case_id', cases.map((c) => c.id))
      : { data: [] as { case_id: string }[] };
    const responded = new Set((responses ?? []).map((r) => r.case_id));
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
        mentorId: c.mentorId,
        mentorName: c.mentorName,
        mentorActiveCount: c.mentorActiveCount,
        surveyStatus: responded.has(c.id) ? 'done' : c.survey_opened_at ? 'open' : 'none',
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
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">멘토별 진행현황 · 지급서류</h2>
            <p className="text-xs text-muted-foreground">담당 멘티 · 이행 회차 · 확정 실지급 · 지급서류 상태(- 관리 안 함 / X 관리하지만 미수령 / O 수령) · 그룹 지정 · 원천징수 · 운영사 평가. 지급서류 상태 변경은 비밀번호 재인증이 필요합니다.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a href="/api/staff/mentor-docs-zip" title="멘토별 폴더로 정리된 ZIP — 지급서류(이력서·통장·신분증)와 위촉 서식 제출 파일">
              <Download className="h-4 w-4" /> 멘토 서류 일괄 다운로드 (ZIP)
            </a>
          </Button>
        </div>
        <MentorsRoster mentors={mentors} groups={groups.map((g) => ({ id: g.id, name: g.name }))} showUploads={featureEnabled(ctx.program.features, 'mentor_doc_upload')} />
        <div>
          <h2 className="text-lg font-semibold">멘토 계정 관리</h2>
          <p className="text-xs text-muted-foreground">정보 수정 · 역할 변경 · 활성/비활성 · 로그인 안내 문자 · 화면 보기(대행)</p>
        </div>
        <MembersManager members={memberItems} rosterColumns={roster.columns.map((c) => ({ id: c.id, target: c.target, name: c.name }))} rosterValues={roster.values} mode="mentor" />
      </>
    );
  }

  if (tab === 'institution' || tab === 'nextlab') {
    const roleLabel = tab === 'institution' ? '발주처' : '운영사';
    body = (
      <>
        <ActiveHelp />
        <p className="text-sm text-muted-foreground">
          {roleLabel} 담당자를 관리합니다. {tab === 'nextlab' ? '등급(PL/PM/부PM/옵저버)·직위·담당역할은 [정보 수정]에서 바꿉니다.' : '직위·담당역할은 [정보 수정]에서 바꿉니다.'}
        </p>
        <MembersManager members={memberItems.filter((m) => m.role === tab)} rosterColumns={[]} rosterValues={{}} mode="staff" />
      </>
    );
  }

  if (tab === 'mentor-match' || tab === 'mentee-match') {
    const { loadMatchingLists } = await import('@/lib/data/matching-lists');
    const lists = await loadMatchingLists(ctx.programId, ctx.supportTypeId ?? null);
    body = tab === 'mentor-match' ? <MentorMatchList rows={lists.mentorRows} /> : <MenteeMatchList rows={lists.menteeRows} />;
  }

  if (tab === 'register') {
    const groups = await listSupportTypes(ctx.programId);
    const groupOpts = groups.filter((g) => g.status === 'active').map((g) => ({ id: g.id, code: g.code, name: g.name }));
    body = (
      <RegisterPanel
        groups={groupOpts}
        counts={{ mentee: countOf('mentee'), mentor: countOf('mentor'), nextlab: countOf('nextlab'), institution: countOf('institution') }}
        initialReg={reg}
      />
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
        {(tab === 'mentee' || tab === 'mentor' || tab === 'institution' || tab === 'nextlab') && (
          <ExcelButton href={`/api/nextlab/roster-export?tab=${tab}`} label="엑셀 다운로드" />
        )}
      </div>
      <nav className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/nextlab/roster?tab=${t.key}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}
          >
            {t.label}
            {tabCounts[t.key] !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${tab === t.key ? 'bg-primary-foreground/20' : 'bg-background text-foreground'}`}>
                {tabCounts[t.key]}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {body}
    </main>
  );
}
