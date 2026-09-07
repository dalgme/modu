import { requireStaff } from '@/lib/auth/guards';
import {
  solapiConfigured,
  solapiSender,
  getSolapiBalance,
  getSolapiMessages,
} from '@/lib/notifications/solapi';
import { listSmsRecipients } from '@/lib/data/members';
import { getMentorReminderConfig, getMenteeGuideSmsTemplate } from '@/lib/data/app-settings';
import { listMentorsNeedingWeeklyReminder } from '@/lib/notifications/mentor-weekly-reminder';
import { listScheduledMessages } from '@/lib/data/scheduled-messages';
import { SmsComposer } from '@/components/admin/sms-composer';
import { SmsSendList } from '@/components/admin/sms-send-list';
import { MentorReminderCard } from '@/components/admin/mentor-reminder-card';
import { MenteeGuideSmsCard } from '@/components/admin/mentee-guide-sms-card';
import { ScheduledMessagesList } from '@/components/admin/scheduled-messages-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Solapi 잔액·발송리스트를 매 요청 최신 조회
export const dynamic = 'force-dynamic';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function Page() {
  await requireStaff();
  const configured = solapiConfigured();

  const [balance, messages, recipients] = configured
    ? await Promise.all([getSolapiBalance(), getSolapiMessages(120), listSmsRecipients()])
    : [null, null, []];

  // 예약·자동안내문 관련 데이터 (Solapi 연동 여부와 무관하게 DB 조회)
  const [reminderConfig, eligibleMentors, scheduled, menteeGuideTemplate] = await Promise.all([
    getMentorReminderConfig(),
    listMentorsNeedingWeeklyReminder(),
    listScheduledMessages(),
    getMenteeGuideSmsTemplate(),
  ]);
  const eligiblePreview = eligibleMentors.map((m) => ({ name: m.name, companies: m.companies }));

  const balanceText =
    balance && balance.ok ? `${balance.balance.toLocaleString()}원` : configured ? '조회 실패' : '-';
  const pointText = balance && balance.ok ? `포인트 ${balance.point.toLocaleString()}` : undefined;
  const list = messages && messages.ok ? messages.messages : [];

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">문자발송 현황</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          연동 상태·잔액을 확인하고 회원에게 문자를 발송하며, 회원별·날짜별 발송 내역을 확인합니다.
        </p>
      </div>

      {/* 멘토 주간 자동 안내문자 (상단 강조 섹션) */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-base">멘토 주간 자동 안내문자</CardTitle>
          <p className="text-xs text-muted-foreground">
            매주 월요일 12:30, 조건에 해당하는 멘토에게 자동으로 진행 독려 문자를 발송합니다. 아래에서
            문구를 수정하고 자동발송 여부를 조절할 수 있습니다.
          </p>
        </CardHeader>
        <CardContent>
          <MentorReminderCard
            initialTemplate={reminderConfig.template}
            initialEnabled={reminderConfig.enabled}
            eligible={eligiblePreview}
            configured={configured}
          />
        </CardContent>
      </Card>

      {/* 멘티 안내 문자 문구 (넥스트랩 '멘티기업 현황판'의 안내문자 버튼이 사용) */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-base">멘티 안내 문자 문구</CardTitle>
          <p className="text-xs text-muted-foreground">
            넥스트랩 <b>멘티기업 현황판</b>의 &lsquo;멘티 안내 문자보내기&rsquo; 버튼이 보내는
            문구입니다. 지원신청 서류 안내·플랫폼 사용 안내(아이디·비밀번호·URL)를 담습니다.
          </p>
        </CardHeader>
        <CardContent>
          <MenteeGuideSmsCard initialTemplate={menteeGuideTemplate} />
        </CardContent>
      </Card>

      {/* 상태·잔액 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">연동 상태</p>
          <p
            className={cn(
              'mt-1 text-xl font-semibold',
              configured ? 'text-status-approved' : 'text-status-rejected',
            )}
          >
            {configured ? '연동됨' : '미설정'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Solapi v4 · HMAC-SHA256</p>
        </div>
        <StatCard label="잔액" value={balanceText} sub={pointText} />
        <StatCard label="발신번호 1 (기본)" value={solapiSender(1) ?? '-'} />
        <StatCard
          label="발신번호 2 (보조)"
          value={process.env.SOLAPI_SENDER_NUMBER_2 ?? '-'}
        />
      </div>

      {!configured && (
        <div className="rounded-lg border border-status-rejected/40 bg-status-rejected/5 p-4 text-sm">
          <p className="font-medium text-status-rejected">API 키가 설정되지 않았습니다.</p>
          <p className="mt-1 text-muted-foreground">
            Vercel 환경변수 SOLAPI_API_KEY · SOLAPI_API_SECRET · SOLAPI_SENDER_NUMBER_1 설정 후
            재배포하세요.
          </p>
        </div>
      )}

      {/* 문자 발송 (회원 수신자 선택) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">문자 발송</CardTitle>
          <p className="text-xs text-muted-foreground">
            플랫폼 회원을 수신자로 선택(중복 선택·개별 제거)하고 메시지를 작성하면 예상 발송비용이
            실시간으로 계산됩니다.
          </p>
        </CardHeader>
        <CardContent>
          <SmsComposer recipients={recipients} configured={configured} />
        </CardContent>
      </Card>

      {/* 예약 발송 현황 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">예약 발송 현황</CardTitle>
          <p className="text-xs text-muted-foreground">
            예약한 문자는 지정한 시각에 자동 발송됩니다(최대 5분 이내 오차). 발송 전에는 취소할 수
            있습니다.
          </p>
        </CardHeader>
        <CardContent>
          <ScheduledMessagesList items={scheduled} />
        </CardContent>
      </Card>

      {/* 회원별·날짜별 발송 현황 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">문자발송 현황 (회원별 · 날짜별)</CardTitle>
          <p className="text-xs text-muted-foreground">
            플랫폼 회원(등록된 휴대폰)에게 발송된 내역을 날짜별로 묶어 회원 이름과 함께 보여줍니다.
            &lsquo;전체&rsquo;로 전환하면 비회원 번호 발송분까지 확인할 수 있습니다. 이 서비스
            발신번호({[solapiSender(1), solapiSender(2)].filter(Boolean).join(' · ') || '-'})로 보낸
            문자만 표시됩니다.
          </p>
        </CardHeader>
        <CardContent>
          {messages && !messages.ok ? (
            <p className="py-6 text-center text-sm text-status-rejected">
              발송 리스트 조회 실패: {messages.error}
            </p>
          ) : (
            <SmsSendList messages={list} recipients={recipients} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
