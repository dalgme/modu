import Link from 'next/link';
import { requireStaff } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import {
  solapiConfigured,
  solapiSender,
  getSolapiBalance,
  getSolapiMessages,
} from '@/lib/notifications/solapi';
import { listSmsRecipients } from '@/lib/data/members';
import { listEligibleMentors, listReminderSettings, previewEligibleForSetting, type EligibleMentor } from '@/lib/notifications/mentor-weekly-reminder';
import { listSupportTypes } from '@/lib/programs/data';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { SubTabs } from '@/components/common/sub-tabs';
import { MentorReminderPanel, type ReminderScope } from '@/components/admin/mentor-reminder-panel';
import { BellRing, CalendarClock, History, Send } from 'lucide-react';
import { listScheduledMessages } from '@/lib/data/scheduled-messages';
import { SmsComposer } from '@/components/admin/sms-composer';
import { SmsSendList } from '@/components/admin/sms-send-list';
import { ScheduledMessagesList } from '@/components/admin/scheduled-messages-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Solapi 잔액·발송리스트를 매 요청 최신 조회. 대량 발송(수백 명 순차)이 길어질 수 있어 함수 시간을 늘린다.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const TABS = [
  { key: 'send', label: '문자 발송', icon: Send },
  { key: 'reminder', label: '멘토 리마인더', icon: BellRing },
  { key: 'scheduled', label: '예약 발송', icon: CalendarClock },
  { key: 'history', label: '발송 현황', icon: History },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default async function Page({ searchParams }: { searchParams: { tab?: string } }) {
  const profile = await requireStaff();
  const ctx = await requireContext(profile);
  const configured = solapiConfigured();
  const tab: TabKey = (TABS.find((t) => t.key === searchParams.tab)?.key ?? 'send') as TabKey;

  // 행사별 문자 API 등록·활성 여부 — 발송 경로 안내(확인창)와 리마인더 준비 상태에 쓴다
  const { data: psms } = await createAdminClient().from('program_sms_settings').select('is_active').eq('program_id', ctx.programId).maybeSingle();
  const programSmsActive = !!psms?.is_active;
  // 발송 권한 — 운영사 문자 권한자만. 발주처는 열람 전용 (버튼 잠금 + 서버 액션도 별도 차단)
  const canSend = profile.role === 'nextlab' && denyUnless(ctx, 'sms') === null;

  // 수신자는 행사별 API 만 있어도 필요하다. 잔액·발송 리스트는 플랫폼 공통 연동일 때만.
  const [balance, messages, recipients] = await Promise.all([
    configured ? getSolapiBalance() : Promise.resolve(null),
    configured ? getSolapiMessages(120) : Promise.resolve(null),
    configured || programSmsActive ? listSmsRecipients(ctx.programId, ctx.supportTypeId) : Promise.resolve([]),
  ]);

  // 예약 발송 (Solapi 연동 여부와 무관하게 DB 조회)
  const scheduled = await listScheduledMessages(ctx.programId);

  // 멘토 리마인더 — 행사·그룹별 설정 + 범위별 발송 대상 (P29)
  let reminderScopes: ReminderScope[] = [];
  if (tab === 'reminder') {
    const [settings, groups] = await Promise.all([
      listReminderSettings(ctx.programId),
      listSupportTypes(ctx.programId),
    ]);
    const activeGroups = groups.filter((g) => g.status === 'active');
    const common = settings.find((x) => x.supportTypeId === null) ?? null;
    const commonPreview = common ? await previewEligibleForSetting(common, settings) : { groups: activeGroups.filter((g) => !settings.some((x) => x.supportTypeId === g.id)).map((g) => ({ id: g.id, name: g.name })), mentors: [] as EligibleMentor[] };
    const groupScopes: ReminderScope[] = await Promise.all(
      activeGroups.map(async (g) => {
        const own = settings.find((x) => x.supportTypeId === g.id) ?? null;
        return { id: g.id, name: g.name, setting: own, eligible: await listEligibleMentors(ctx.programId, [g.id]), coveredGroups: [] };
      }),
    );
    reminderScopes = [{ id: null, name: '행사 공통', setting: common, eligible: commonPreview.mentors, coveredGroups: commonPreview.groups.map((g) => g.name) }, ...groupScopes];
  }
  const canEditReminder = canSend;

  const balanceText =
    balance && balance.ok ? `${balance.balance.toLocaleString()}원` : configured ? '조회 실패' : '-';
  const pointText = balance && balance.ok ? `포인트 ${balance.point.toLocaleString()}` : undefined;
  const list = messages && messages.ok ? messages.messages : [];

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">문자 발송</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ' · 행사 전체'} — 회원에게 문자 발송 · 멘토 리마인더 자동 발송(그룹별) · 예약 · 발송 내역.
        </p>
      </div>

      <SubTabs ariaLabel="문자 메뉴" active={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon, href: `/admin/settings/sms?tab=${t.key}` }))} />

      {tab === 'send' && (
        <>
          {/* 상태·잔액 카드 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-xs text-muted-foreground">플랫폼 공통 연동</p>
              <p className={cn('mt-1 text-xl font-semibold', configured ? 'text-status-approved' : 'text-status-rejected')}>{configured ? '연동됨' : '미설정'}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">행사별 문자 API 가 있으면 그쪽이 우선</p>
            </div>
            <StatCard label="잔액" value={balanceText} sub={pointText} />
            <StatCard label="발신번호 1 (기본)" value={solapiSender(1) ?? '-'} />
            <StatCard label="발신번호 2 (보조)" value={process.env.SOLAPI_SENDER_NUMBER_2 ?? '-'} />
          </div>

          {!configured && (
            <div className="rounded-lg border border-status-rejected/40 bg-status-rejected/5 p-4 text-sm">
              <p className="font-medium text-status-rejected">플랫폼 공통 문자 API 가 설정되지 않았습니다.</p>
              <p className="mt-1 text-muted-foreground">
                행사별 문자 API 를 <Link href="/nextlab/settings/sms-api" className="underline">운영 설정 › 문자 API</Link>에 등록하면 그 발신번호로 발송됩니다. 플랫폼 공통 발송이 필요하면 플랫폼 관리자에게 문의하세요.
              </p>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">문자 발송</CardTitle>
              <p className="text-xs text-muted-foreground">
                현재 범위의 회원을 수신자로 선택(중복 선택·개별 제거)하고 메시지를 작성하면 예상 발송비용이 실시간으로 계산됩니다. 로그인 안내 문자는 회원 명단에서, 지연 독려는 리포트 개요에서 보냅니다.
              </p>
            </CardHeader>
            <CardContent>
              <SmsComposer recipients={recipients} configured={configured} programSmsActive={programSmsActive} canSend={canSend} scopeLabel={ctx.group ? ctx.group.name : '행사 전체'} />
            </CardContent>
          </Card>
        </>
      )}

      {tab === 'reminder' && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-base">멘토 리마인더 문자 (진행 독려 · 자동)</CardTitle>
            <p className="text-xs text-muted-foreground">
              행사 공통 또는 사업그룹(라운드)별로 요일·시각·문구·자동발송 여부를 정합니다. 배정된 멘티 중 회차가 아직 남은 멘티가 있는 멘토에게만 발송되며, 행사별 문자 API 가 있으면 그 발신번호로 나갑니다.
              {!canEditReminder && ' (설정 변경은 운영사 문자 권한 담당자만 가능합니다.)'}
            </p>
          </CardHeader>
          <CardContent>
            <MentorReminderPanel scopes={reminderScopes} programName={ctx.program.name} initialScope={ctx.supportTypeId ?? null} canEdit={canEditReminder} smsReady={configured || programSmsActive} />
          </CardContent>
        </Card>
      )}

      {tab === 'scheduled' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">예약 발송 현황</CardTitle>
            <p className="text-xs text-muted-foreground">예약한 문자는 지정한 시각에 자동 발송됩니다(최대 5분 이내 오차). 발송 전에는 취소할 수 있습니다. 예약은 [문자 발송]에서 메시지 작성 시 만듭니다.</p>
          </CardHeader>
          <CardContent>
            <ScheduledMessagesList items={scheduled} canCancel={canSend} />
          </CardContent>
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">문자발송 현황 (회원별 · 날짜별)</CardTitle>
            <p className="text-xs text-muted-foreground">
              플랫폼 회원(등록된 휴대폰)에게 발송된 내역을 날짜별로 묶어 회원 이름과 함께 보여줍니다. &lsquo;전체&rsquo;로 전환하면 비회원 번호 발송분까지 확인할 수 있습니다. 플랫폼 공통 발신번호({[solapiSender(1), solapiSender(2)].filter(Boolean).join(' · ') || '-'})로 보낸 문자만 표시됩니다.
            </p>
          </CardHeader>
          <CardContent>
            {messages && !messages.ok ? (
              <p className="py-6 text-center text-sm text-status-rejected">발송 리스트 조회 실패: {messages.error}</p>
            ) : (
              <SmsSendList messages={list} recipients={recipients} />
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
