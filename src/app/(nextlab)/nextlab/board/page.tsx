import { requireNextlab } from '@/lib/auth/guards';
import { listCases } from '@/lib/data/cases';
import { getMenteeGuideSmsSentMap } from '@/lib/data/mentee-guide-sms';
import { getActiveEditGrantCaseIds } from '@/lib/data/edit-grants';
import { StageBoard } from '@/components/cases/stage-board';
import { MentorBoard } from '@/components/cases/mentor-board';
import { CaseProgressList } from '@/components/cases/case-progress-list';
import { CaseBoardTabs, toBoardView } from '@/components/cases/case-board-tabs';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams?: { view?: string } }) {
  await requireNextlab();
  const view = toBoardView(searchParams?.view);
  const cases = await listCases({});
  const editGrantSet = await getActiveEditGrantCaseIds(cases.map((c) => c.id));
  const editGrantIds = Array.from(editGrantSet);
  const guideSentAt =
    view === 'mentee' ? await getMenteeGuideSmsSentMap(cases.map((c) => c.id)) : undefined;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">현황판</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          진행단계 · 멘토별 · 멘티별로 전체 케이스를 확인합니다.
        </p>
      </div>
      <CaseBoardTabs basePath="/nextlab/board" active={view} />
      {view === 'stage' && (
        <StageBoard items={cases} basePath="/nextlab/cases" editGrantIds={editGrantIds} />
      )}
      {view === 'mentor' && (
        <MentorBoard items={cases} basePath="/nextlab/cases" editGrantIds={editGrantIds} />
      )}
      {view === 'mentee' && (
        <CaseProgressList
          items={cases}
          basePath="/nextlab/cases"
          showMenteeGuideSms
          menteeGuideSentAt={guideSentAt}
          editGrantCaseIds={editGrantSet}
        />
      )}
    </main>
  );
}
