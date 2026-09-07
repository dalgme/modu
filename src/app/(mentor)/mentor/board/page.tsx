import { requireMentor } from '@/lib/auth/guards';
import { listMentorCases } from '@/lib/data/cases';
import { StageBoard } from '@/components/cases/stage-board';

export default async function Page() {
  const profile = await requireMentor();
  const cases = await listMentorCases(profile.id);
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">진행현황판</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          담당 멘티기업이 어느 단계에 있는지 단계별로 확인합니다.
        </p>
      </div>
      <StageBoard items={cases} basePath="/mentor/cases" />
    </main>
  );
}
