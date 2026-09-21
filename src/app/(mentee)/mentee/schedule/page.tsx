import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMenteeSchedule } from '@/lib/data/schedule';
import { ScheduleCalendar } from '@/components/schedule/schedule-calendar';

export const dynamic = 'force-dynamic';

/** 멘티 스케줄 달력 (P20) — 담당 멘토가 등록한 예약·완료 일정을 확인 */
export default async function Page() {
  const profile = await requireMentee();
  const ctx = await requireContext(profile);
  const events = await listMenteeSchedule(profile.id, ctx.programId);
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">스케줄</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          담당 멘토가 등록한 컨설팅 예약과 완료된 회차를 달력으로 봅니다. 일정 변경이 필요하면 멘토 메시지로 문의하세요.
        </p>
      </div>
      <ScheduleCalendar events={events} />
    </main>
  );
}
