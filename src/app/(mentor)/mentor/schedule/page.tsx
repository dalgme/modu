import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMentorSchedule } from '@/lib/data/schedule';
import { ScheduleCalendar } from '@/components/schedule/schedule-calendar';

export const dynamic = 'force-dynamic';

/** 멘토 스케줄 달력 (P20) — 회차(예약·실행·완료)를 월/주/일로 확인 */
export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const events = await listMentorSchedule(profile.id, ctx.programId);
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">스케줄</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          등록한 컨설팅 계획(예약)과 실행·완료 회차를 달력으로 봅니다. 일정 등록·수정은 각 멘티 케이스의 회차 등록에서 합니다. 일정을 누르면 해당 케이스로 이동합니다.
        </p>
      </div>
      <ScheduleCalendar events={events} caseHrefBase="/mentor/cases" />
    </main>
  );
}
