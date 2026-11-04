import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { loadMentorGroupMentoring } from '@/lib/workflow/group-mentoring';
import { GroupMentoringBoard } from '@/components/mentor/group-mentoring-board';

export const dynamic = 'force-dynamic';

/** 멘토 그룹멘토링 (2026-11-04) — 매칭 멘티 여러 명을 한 번에 진행, 멘티별 1회차·보고서, 수당 1회분 */
export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const rounds = await loadMentorGroupMentoring(profile.id, ctx.programId, ctx.supportTypeId ?? null);
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">그룹멘토링</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          내가 매칭된 멘티 여러 명을 한 자리에서 함께 멘토링할 때 등록합니다. 라운드별 사용 여부와 멘토 1인당 횟수는 운영사가 정합니다.
        </p>
      </div>
      <GroupMentoringBoard rounds={rounds} />
    </main>
  );
}
