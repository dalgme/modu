import { requireMentor } from '@/lib/auth/guards';
import { listMentorCasesWithLogs } from '@/lib/data/mentor-tasks';
import { MenteeWorkBoard, type MenteeWorkItem } from '@/components/mentor/mentee-work-board';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams?: { case?: string } }) {
  const profile = await requireMentor();
  const rows = await listMentorCasesWithLogs(profile.id);

  const items: MenteeWorkItem[] = rows.map(({ case: c, logCount }) => ({
    id: c.id,
    businessName: c.business_name,
    supportTypeName: c.supportTypeName,
    supportTypeCode: c.supportTypeCode,
    status: c.status,
    logCount,
    mentorAssignedAt: c.mentorAssignedAt,
  }));

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘티별 업무진행</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          멘티기업을 선택하면 지원유형에 맞춘 다음 할 일을 순서대로 안내합니다.
        </p>
      </div>
      <MenteeWorkBoard items={items} activeId={searchParams?.case} />
    </main>
  );
}
