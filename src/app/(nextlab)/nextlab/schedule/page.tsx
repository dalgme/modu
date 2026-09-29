import { CalendarDays, CalendarRange, ClipboardList, ListChecks, UserRoundSearch } from 'lucide-react';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { loadStaffSchedule } from '@/lib/data/staff-schedule';
import {
  buildMentorDetail,
  parseMonthParam,
  parseYmdParam,
  roundsInMonth,
  roundsOnDay,
  shiftMonth,
  type StaffRound,
} from '@/lib/data/staff-schedule-shared';
import type { ScheduleEvent } from '@/lib/data/schedule';
import { kstTodayYmd } from '@/lib/utils/kst';
import { SubTabs } from '@/components/common/sub-tabs';
import { EmptyState } from '@/components/common/empty-state';
import { ScheduleCalendar } from '@/components/schedule/schedule-calendar';
import { StatusLegend } from '@/components/nextlab/schedule/status-legend';
import { DateNav } from '@/components/nextlab/schedule/date-nav';
import { TodayList } from '@/components/nextlab/schedule/today-list';
import { MonthCountCalendar } from '@/components/nextlab/schedule/month-count-calendar';
import { MentorList } from '@/components/nextlab/schedule/mentor-list';
import { MentorDetail } from '@/components/nextlab/schedule/mentor-detail';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'today', label: '오늘의 멘토링 리스트', icon: ListChecks },
  { key: 'calendar', label: '전체 달력', icon: CalendarDays },
  { key: 'mentor', label: '멘토별 달력', icon: CalendarRange },
  { key: 'detail', label: '세부일정 정보', icon: ClipboardList },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const BASE = '/nextlab/schedule';

/** 멘토별 달력(ScheduleCalendar) 이벤트로 변환 — 직렬화 가능한 값만 */
function toEvent(r: StaffRound): ScheduleEvent {
  return {
    id: r.id,
    caseId: r.caseId,
    roundNo: r.roundNo,
    ownerName: r.menteeLabel,
    businessName: '',
    mentorName: r.mentorName,
    mode: r.mode,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    place: r.place,
    reported: r.reported,
  };
}

/**
 * 운영사 [스케줄] 탭 — 회차(1단계 계획·2단계 보고서) 일정을 날짜·달력·멘토별로 본다. 열람 전용(옵저버 포함).
 * 범위는 상단 [범위] 스위처(ctx.supportTypeId: null = 행사 전체, 아니면 그 그룹)를 리포트와 똑같이 따른다.
 */
export default async function Page({ searchParams }: { searchParams: { tab?: string; date?: string; month?: string; mentor?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const tab = (TABS.find((t) => t.key === searchParams.tab)?.key ?? 'today') as TabKey;

  const now = Date.now();
  const today = kstTodayYmd(now);
  const date = parseYmdParam(searchParams.date, now);
  const month = parseMonthParam(searchParams.month, undefined, now);
  const showGroup = !ctx.supportTypeId;

  const data = await loadStaffSchedule(ctx.programId, ctx.supportTypeId, now);
  const mentorId = data.mentors.some((m) => m.id === searchParams.mentor) ? (searchParams.mentor as string) : null;
  const mentor = mentorId ? data.mentors.find((m) => m.id === mentorId)! : null;

  const tabHref = (key: TabKey) => {
    const qs = new URLSearchParams({ tab: key });
    if ((key === 'calendar' || key === 'mentor') && searchParams.month) qs.set('month', month);
    if ((key === 'mentor' || key === 'detail') && mentorId) qs.set('mentor', mentorId);
    if (key === 'today' && searchParams.date) qs.set('date', date);
    return `${BASE}?${qs.toString()}`;
  };
  const monthHref = (ym: string, extra: Record<string, string> = {}) => `${BASE}?${new URLSearchParams({ tab, month: ym, ...extra }).toString()}`;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">스케줄</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name}
          {ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 멘토가 등록한 컨설팅 회차(계획·보고서)를 날짜·달력·멘토별로 봅니다. 범위는 상단 [범위]에서 바꿉니다. 일정 등록·수정은 멘토가 케이스 화면에서 합니다(열람 전용).
        </p>
      </div>

      <SubTabs ariaLabel="스케줄 탭" active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon, href: tabHref(t.key) }))} />
      {/* 멘토별 달력은 달력 컴포넌트가 자체 범례를 그린다 */}
      {tab !== 'mentor' && <StatusLegend withUnregistered={tab === 'detail'} />}

      {tab === 'today' && (
        <section className="flex flex-col gap-3">
          <DateNav date={date} today={today} basePath={`${BASE}?tab=today`} />
          <TodayList rows={roundsOnDay(data.rounds, date)} showGroup={showGroup} />
        </section>
      )}

      {tab === 'calendar' && (
        <MonthCountCalendar
          month={month}
          today={today}
          rows={roundsInMonth(data.rounds, month)}
          prevHref={monthHref(shiftMonth(month, -1))}
          nextHref={monthHref(shiftMonth(month, 1))}
          todayHref={monthHref(today.slice(0, 7))}
          showGroup={showGroup}
        />
      )}

      {(tab === 'mentor' || tab === 'detail') && (
        <div className="grid items-start gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
          <MentorList mentors={data.mentors} selectedId={mentorId} hrefBase={tab === 'mentor' && searchParams.month ? `${BASE}?tab=mentor&month=${month}` : `${BASE}?tab=${tab}`} />
          <section className="min-w-0">
            {!mentor ? (
              <EmptyState icon={UserRoundSearch} title="왼쪽 목록에서 멘토를 고르세요." hint={data.mentors.length ? `멘토 ${data.mentors.length}명 (가나다순). 이름·휴대폰으로 검색할 수 있습니다.` : '이 범위에는 아직 배정된 멘토가 없습니다.'} />
            ) : tab === 'mentor' ? (
              <div className="flex flex-col gap-3">
                <h2 className="text-lg font-bold">
                  {mentor.name} 멘토 달력 <span className="text-sm font-semibold text-muted-foreground">· 회차 {mentor.roundCount}건</span>
                </h2>
                <ScheduleCalendar key={mentor.id} events={data.rounds.filter((r) => r.mentorId === mentor.id).map(toEvent)} caseHrefBase="/nextlab/cases" initialDate={month === today.slice(0, 7) ? today : `${month}-01`} showRoundNo />
              </div>
            ) : (
              <MentorDetail mentorName={mentor.name} showGroup={showGroup} {...buildMentorDetail(mentor.id, data.cases, data.rounds)} />
            )}
          </section>
        </div>
      )}
    </main>
  );
}
