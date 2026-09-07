import {
  listCases,
  getMenteeCase,
  listMentorCases,
  listRecalledCases,
} from '@/lib/data/cases';
import { listMentorsWithLoad, listSmsRecipients } from '@/lib/data/members';
import { listOperatorRequests } from '@/lib/data/operator-requests';
import { solapiConfigured, getSolapiMessages } from '@/lib/notifications/solapi';
import { computeCaseStats } from '@/lib/data/stats';
import { listMentorCasesWithLogs } from '@/lib/data/mentor-tasks';
import { getMenteeSubmissionSummary } from '@/lib/data/mentee-progress';
import { listOpenSupplementRequests } from '@/lib/data/supplement-requests';
import { listPublishedFaqs } from '@/lib/data/faqs';
import { listBoardPosts } from '@/lib/data/board';
import {
  listMyInquiries,
  listInquiries,
  INQUIRY_CATEGORY_LABELS,
  INQUIRY_STATUS_LABELS,
} from '@/lib/data/inquiries';
import { StatsChartsLazy as StatsCharts } from '@/components/admin/stats-charts-lazy';
import { StaffCasesView } from '@/components/cases/staff-cases-view';
import { StageBoard } from '@/components/cases/stage-board';
import { CaseProgressList } from '@/components/cases/case-progress-list';
import { MentorBoard } from '@/components/cases/mentor-board';
import { MenteeWorkBoard, type MenteeWorkItem } from '@/components/mentor/mentee-work-board';
import { MentorGuideContent } from '@/components/mentor/mentor-guide-content';
import { MentorDashboardBody } from '@/components/mentor/mentor-dashboard-body';
import { MenteeDashboardBody } from '@/components/mentee/mentee-dashboard-body';
import { InstitutionDashboardBody } from '@/components/institution/institution-dashboard-body';
import { InstitutionGuideContent } from '@/components/institution/institution-guide-content';
import { PwaInstallGuide } from '@/components/common/pwa-install-guide';
import { SmsSendList } from '@/components/admin/sms-send-list';
import { QnaBoard } from '@/components/board/qna-board';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';
import type { Tables } from '@/types/database';
import type { UserRole } from '@/lib/auth/roles';

/** 회원 열람 시 상단에 노출할 메뉴 탭 (해당 역할의 주요 메뉴). tone 은 강조 탭 색상. */
export const VIEW_AS_TABS: Record<
  UserRole,
  { key: string; label: string; tone?: 'green' | 'purple' | 'amber' | 'sky' }[]
> = {
  institution: [
    { key: 'dashboard', label: '대시보드' },
    { key: 'board', label: '진행현황판' },
    { key: 'mentor-board', label: '멘토별 진행현황' },
    { key: 'mentee-board', label: '멘티별 진행현황' },
    { key: 'mentors', label: '멘토 현황' },
    { key: 'requests', label: '요청/문의', tone: 'amber' },
    { key: 'sms', label: '문자발송 현황', tone: 'sky' },
    { key: 'guide', label: '이용방법', tone: 'green' },
    { key: 'install', label: '📱 핸드폰 설치', tone: 'purple' },
  ],
  nextlab: [
    { key: 'dashboard', label: '대시보드' },
    { key: 'board', label: '진행현황판' },
    { key: 'mentor-board', label: '멘토별 현황판' },
    { key: 'mentee-board', label: '멘티기업 현황판' },
    { key: 'inquiries', label: '문의관리' },
  ],
  mentor: [
    { key: 'dashboard', label: '대시보드' },
    { key: 'board', label: '진행현황판' },
    { key: 'tasks', label: '멘티별 업무진행' },
    { key: 'qna', label: '문의 및 요청하기' },
    { key: 'guide', label: '이용안내', tone: 'green' },
    { key: 'install', label: '📱 휴대폰 설치', tone: 'purple' },
  ],
  mentee: [
    { key: 'dashboard', label: '내 진행 현황' },
    { key: 'inquiries', label: '문의하기·내역' },
  ],
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function SectionTitle({ title, desc }: { title: string; desc?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
    </div>
  );
}

/**
 * 넥스트랩 총괄관리자가 특정 회원 화면을 그대로 열람하는 읽기전용 뷰.
 * 상단 메뉴 탭(tab)에 따라 해당 회원 역할의 메뉴별 화면을 렌더한다.
 * 케이스 상세 링크는 넥스트랩 케이스 화면(/nextlab/cases)으로 연결한다.
 */
export async function ViewAsDashboard({
  target,
  tab,
}: {
  target: Tables<'users'>;
  tab?: string;
}) {
  const tabs = VIEW_AS_TABS[target.role];
  const active = tabs.find((t) => t.key === tab)?.key ?? tabs[0]!.key;

  // 케이스 카드 클릭 시 회원 열람 상태를 유지하도록, 케이스 상세도 view-as 내부 경로로 연결한다.
  const caseBase = `/nextlab/view/${target.id}/case`;

  // ── 진흥원 ──────────────────────────────────────────
  if (target.role === 'institution') {
    if (active === 'install') {
      return <PwaInstallGuide />;
    }
    if (active === 'guide') {
      return <InstitutionGuideContent />;
    }
    if (active === 'requests') {
      const requests = await listOperatorRequests();
      const mine = requests.filter((r) => r.created_by === target.id);
      return (
        <div className="flex flex-col gap-4">
          <SectionTitle
            title="요청 / 문의"
            desc="진흥원이 넥스트랩(운영사)에 보낸 요청/문의입니다. (열람 전용 — 실제 등록은 진흥원 계정에서)"
          />
          {mine.length === 0 ? (
            <EmptyState message="보낸 요청이 없습니다." />
          ) : (
            <div className="flex flex-col gap-2">
              {mine.map((r) => (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-sm">{r.title}</CardTitle>
                      <span className="text-xs text-muted-foreground">
                        {r.read_at ? '넥스트랩 확인' : '확인대기'} · {formatDateTime(r.created_at)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (active === 'sms') {
      const [msgs, recipients] = solapiConfigured()
        ? await Promise.all([getSolapiMessages(120), listSmsRecipients()])
        : [null, []];
      const list = msgs && msgs.ok ? msgs.messages : [];
      return (
        <div className="flex flex-col gap-4">
          <SectionTitle
            title="문자발송 현황"
            desc="플랫폼 회원(등록 휴대폰)에게 발송된 문자를 날짜별로 확인합니다. (열람 전용 — 실제 발송은 진흥원/넥스트랩 계정에서)"
          />
          {!solapiConfigured() ? (
            <EmptyState message="문자 발송 연동(Solapi)이 설정되지 않았습니다." />
          ) : msgs && !msgs.ok ? (
            <EmptyState message={`발송 내역 조회 실패: ${msgs.error}`} />
          ) : (
            <SmsSendList messages={list} recipients={recipients} />
          )}
        </div>
      );
    }
    if (active === 'mentors') {
      const mentors = await listMentorsWithLoad();
      return (
        <div className="flex flex-col gap-4">
          <SectionTitle
            title="멘토 현황"
            desc={`멘토별 연락처와 배정 멘티 수입니다. (총 ${mentors.length}명)`}
          />
          {mentors.length === 0 ? (
            <EmptyState message="등록된 멘토가 없습니다." />
          ) : (
            <div className="flex flex-col gap-2">
              {mentors.map((m) => (
                <Card key={m.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-semibold">{m.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {m.email ?? '-'} · {m.phone ?? '-'}
                      </span>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      배정 멘티 {m.menteeCount}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      );
    }
    const cases = await listCases({});
    if (active === 'board') {
      return <StageBoard items={cases} basePath={caseBase} />;
    }
    if (active === 'mentor-board') {
      return (
        <div className="flex flex-col gap-4">
          <SectionTitle
            title="멘토별 진행현황"
            desc="멘토별로 담당 멘티기업과 각 기업의 진행단계를 확인합니다."
          />
          <MentorBoard items={cases} basePath={caseBase} />
        </div>
      );
    }
    if (active === 'mentee-board') {
      return (
        <div className="flex flex-col gap-4">
          <SectionTitle
            title="멘티별 진행현황"
            desc="전체 멘티기업의 기본정보와 진행단계를 한 리스트로 확인합니다."
          />
          <CaseProgressList items={cases} basePath={caseBase} />
        </div>
      );
    }
    const recalled = await listRecalledCases();
    return (
      <InstitutionDashboardBody
        cases={cases}
        recalled={recalled}
        searchParams={{}}
        basePath={caseBase}
        editBasePath="/nextlab/cases"
        viewAsUserId={target.id}
      />
    );
  }

  // ── 넥스트랩 ────────────────────────────────────────
  if (target.role === 'nextlab') {
    const cases = await listCases({});
    if (active === 'board') {
      return <StageBoard items={cases} basePath={caseBase} />;
    }
    if (active === 'mentor-board') {
      return (
        <div className="flex flex-col gap-4">
          <SectionTitle
            title="멘토별 현황판"
            desc="멘토별로 담당 멘티기업과 각 기업의 진행단계를 확인합니다."
          />
          <MentorBoard items={cases} basePath={caseBase} />
        </div>
      );
    }
    if (active === 'mentee-board') {
      return (
        <div className="flex flex-col gap-4">
          <SectionTitle
            title="멘티기업 현황판"
            desc="전체 멘티기업의 기본정보와 진행단계를 한 리스트로 확인합니다."
          />
          <CaseProgressList items={cases} basePath={caseBase} />
        </div>
      );
    }
    if (active === 'inquiries') {
      const inquiries = await listInquiries();
      const openCount = inquiries.filter((q) => q.status === 'open').length;
      return (
        <div className="flex flex-col gap-4">
          <SectionTitle
            title="문의관리"
            desc={`멘티 문의를 확인하고 답변합니다. 미답변 ${openCount}건 (열람 전용 — 답변은 넥스트랩 계정에서)`}
          />
          {inquiries.length === 0 ? (
            <EmptyState message="접수된 문의가 없습니다." />
          ) : (
            <div className="flex flex-col gap-3">
              {inquiries.map((q) => {
                const answered = q.status !== 'open';
                return (
                  <Card key={q.id}>
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-sm">
                          [{INQUIRY_CATEGORY_LABELS[q.category] ?? q.category}] {q.subject}
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">
                          {INQUIRY_STATUS_LABELS[q.status] ?? q.status} ·{' '}
                          {formatDateTime(q.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {q.menteeName ?? '멘티'}
                        {q.businessName ? ` · ${q.businessName}` : ''}
                      </p>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 text-sm">
                      <p className="whitespace-pre-wrap text-muted-foreground">{q.body}</p>
                      {answered && q.answer && (
                        <div className="rounded-md border bg-muted/40 p-2.5">
                          <p className="text-xs font-medium text-primary">운영기관 답변</p>
                          <p className="mt-1 whitespace-pre-wrap">{q.answer}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    const stats = computeCaseStats(cases);
    return (
      <div className="flex flex-col gap-6">
        <StatsCharts stats={stats} />
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">케이스</h2>
          <StaffCasesView basePath={caseBase} searchParams={{}} items={cases} />
        </div>
      </div>
    );
  }

  // ── 멘토 ────────────────────────────────────────────
  if (target.role === 'mentor') {
    if (active === 'board') {
      const cases = await listMentorCases(target.id);
      return <StageBoard items={cases} basePath={caseBase} />;
    }
    if (active === 'tasks') {
      const rows = await listMentorCasesWithLogs(target.id);
      const items: MenteeWorkItem[] = rows.map(({ case: c, logCount }) => ({
        id: c.id,
        businessName: c.business_name,
        supportTypeName: c.supportTypeName,
        supportTypeCode: c.supportTypeCode,
        status: c.status,
        logCount,
        mentorAssignedAt: c.mentorAssignedAt,
      }));
      return <MenteeWorkBoard items={items} />;
    }
    if (active === 'qna') {
      const posts = await listBoardPosts();
      return <QnaBoard posts={posts} currentUserId={target.id} currentRole="mentor" />;
    }
    if (active === 'guide') {
      const faqs = await listPublishedFaqs('mentor');
      return <MentorGuideContent faqs={faqs} showCtas={false} />;
    }
    if (active === 'install') {
      return <PwaInstallGuide />;
    }
    const cases = await listMentorCases(target.id);
    return (
      <MentorDashboardBody
        name={target.name}
        cases={cases}
        basePath={caseBase}
        viewAsUserId={target.id}
      />
    );
  }

  // ── 멘티 ────────────────────────────────────────────
  if (active === 'inquiries') {
    const inquiries = await listMyInquiries(target.id);
    return inquiries.length === 0 ? (
      <EmptyState message="문의내역이 없습니다." />
    ) : (
      <div className="flex flex-col gap-3">
        {inquiries.map((q) => {
          const answered = q.status === 'answered' || !!q.answer;
          return (
            <Card key={q.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    [{INQUIRY_CATEGORY_LABELS[q.category] ?? q.category}] {q.subject}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {INQUIRY_STATUS_LABELS[q.status] ?? q.status} · {formatDateTime(q.created_at)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="whitespace-pre-wrap text-muted-foreground">{q.body}</p>
                {answered && q.answer && (
                  <div className="rounded-md border bg-muted/40 p-2.5">
                    <p className="text-xs font-medium text-primary">운영기관 답변</p>
                    <p className="mt-1 whitespace-pre-wrap">{q.answer}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // 멘티 기본: 실제 멘티 대시보드를 그대로 재현 (공용 본문 컴포넌트로 완전 동일하게)
  const myCase = await getMenteeCase(target.id);
  const [summary, supplements] = myCase
    ? await Promise.all([
        getMenteeSubmissionSummary(myCase.id),
        listOpenSupplementRequests(myCase.id),
      ])
    : [null, []];
  return (
    <MenteeDashboardBody
      name={target.name}
      myCase={myCase}
      summary={summary}
      supplements={supplements}
      viewAsUserId={target.id}
    />
  );
}
