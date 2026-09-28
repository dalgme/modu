import { getSystemStatus } from '@/lib/platform/data';
import { listRecentErrorReports, type RecentErrorReports } from '@/lib/ops/error-reports';
import { formatDateTime, formatNumber } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-red-500'}`} />;
}

/** 시스템 상태 — 배포·설정 존재 여부·Cron 생존·문자/AI 구성. 값은 노출하지 않고 존재 여부만 본다. */
export default async function Page() {
  const s = await getSystemStatus();
  // (P34-B) 최근 24시간 화면 오류 보고 — 표가 아직 없거나(마이그레이션 전) 조회 실패면 null 로 두고 페이지는 그린다
  const errors: RecentErrorReports | null = await listRecentErrorReports({ hours: 24 }).catch(() => null);
  const lastSentAge = s.notifications.lastSentAt ? Date.now() - new Date(s.notifications.lastSentAt).getTime() : null;
  const queueStale = s.notifications.pending > 0 && s.notifications.oldestPendingAt && Date.now() - new Date(s.notifications.oldestPendingAt).getTime() > 30 * 60_000;
  const LEVEL = { required: '필수', recommended: '권장', optional: '선택', must_absent: '운영 중 삭제' } as const;
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">시스템 상태</h1>
        <p className="mt-1 text-sm text-muted-foreground">배포 정보와 설정 존재 여부, 알림 Cron 생존 상태입니다. 비밀값은 표시하지 않습니다. 설정 변경은 Vercel 환경변수에서 합니다.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border bg-background p-4 text-sm">
          <p className="text-xs text-muted-foreground">배포</p>
          <p className="mt-1 font-semibold">{s.deployment.env ?? '로컬'}{s.deployment.region ? ` · ${s.deployment.region}` : ''}</p>
          <p className="text-xs text-muted-foreground">커밋 {s.deployment.commit ?? '-'}{s.deployment.branch ? ` · ${s.deployment.branch}` : ''} · Node {s.deployment.nodeVersion}</p>
          <p className="text-xs text-muted-foreground">앱 주소 {s.deployment.appUrl ?? '-'}</p>
          <p className="text-xs text-muted-foreground">DB {s.deployment.supabaseHost ?? '-'}</p>
        </div>
        <div className={`rounded-xl border bg-background p-4 text-sm ${queueStale ? 'border-amber-300' : ''}`}>
          <p className="text-xs text-muted-foreground">알림 Cron (5분마다)</p>
          <p className="mt-1 flex items-center gap-2 font-semibold"><Dot ok={!queueStale} warn={!s.notifications.lastSentAt} /> 대기 {formatNumber(s.notifications.pending)}건</p>
          <p className="text-xs text-muted-foreground">마지막 발송 {s.notifications.lastSentAt ? `${formatDateTime(s.notifications.lastSentAt)} (${Math.round((lastSentAge ?? 0) / 60_000)}분 전)` : '없음'}</p>
          <p className="text-xs text-muted-foreground">최근 7일 발송 {s.notifications.sent7d} · 실패 {s.notifications.failed7d}</p>
          {queueStale && <p className="mt-1 text-xs text-amber-700">30분 넘게 대기 중인 알림이 있습니다. Vercel Cron 등록과 CRON_SECRET 을 확인하세요.</p>}
        </div>
        <div className="rounded-xl border bg-background p-4 text-sm">
          <p className="text-xs text-muted-foreground">문자 · AI · 저장소</p>
          <p className="mt-1 flex items-center gap-2"><Dot ok={s.sms.programsWithOwnApi > 0 || s.sms.platformFallback} warn /> 행사별 문자 API 등록 {s.sms.programsWithOwnApi}/{s.sms.programsTotal} 행사{s.sms.platformFallback ? ' · 플랫폼 폴백 있음' : ' · 폴백 없음'}</p>
          <p className="mt-1 flex items-center gap-2"><Dot ok={s.ai.configured} warn /> AI 매칭 {s.ai.configured ? '모델 근거 사용' : '객관 점수만'} · 최근 30일 추천 {s.ai.recommendations30d}건</p>
          <p className="mt-1 text-xs text-muted-foreground">문서 파일 {formatNumber(s.storage.documents)}건</p>
        </div>
      </section>

      <section className="rounded-xl border bg-background">
        <div className="border-b px-4 py-3"><h2 className="text-base font-semibold">환경 설정 점검</h2></div>
        <ul className="divide-y text-sm">
          {s.config.map((c) => {
            const ok = c.level === 'must_absent' ? !c.present : c.present;
            const warn = c.level === 'optional' || c.level === 'recommended';
            return (
              <li key={c.key} className="flex flex-wrap items-center gap-3 px-4 py-2">
                <Dot ok={ok} warn={!ok && warn} />
                <span className="w-56 font-medium">{c.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.key}</span>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px]">{LEVEL[c.level]}</span>
                <span className={`w-16 text-right text-xs ${ok ? 'text-emerald-700' : warn ? 'text-amber-700' : 'text-destructive'}`}>
                  {c.level === 'must_absent' ? (c.present ? '남아 있음' : '삭제됨') : c.present ? '설정됨' : '없음'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* (P34-B) 오류 경계(error.tsx / SafeSlot)가 /api/client-error 로 보고한 화면 오류. Cron error-alert 이 5분마다 문자 통보. */}
      <section className="rounded-xl border bg-background">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h2 className="text-base font-semibold">최근 24시간 화면 오류</h2>
          {errors && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${errors.total > 0 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>
              총 {formatNumber(errors.total)}건
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">오류 화면이 뜨면 자동 기록 · 플랫폼 관리자 휴대폰으로 5분 내 문자(30분 쿨다운) · 외부 모니터는 /api/health</span>
        </div>
        {!errors ? (
          <p className="px-4 py-6 text-sm text-amber-700">오류 보고 표를 읽지 못했습니다. 마이그레이션 0085(error_reports) 적용 여부를 확인하세요.</p>
        ) : errors.total === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">오류 보고 없음</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-right font-medium">건수</th>
                  <th className="px-4 py-2 text-left font-medium">경로</th>
                  <th className="px-4 py-2 text-left font-medium">범위</th>
                  <th className="px-4 py-2 text-left font-medium">오류 코드</th>
                  <th className="px-4 py-2 text-left font-medium">첫 보고</th>
                  <th className="px-4 py-2 text-left font-medium">마지막 보고</th>
                  <th className="px-4 py-2 text-left font-medium">메시지(샘플)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {errors.groups.map((g) => (
                  <tr key={g.key} className="align-top">
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatNumber(g.count)}</td>
                    <td className="max-w-[16rem] break-all px-4 py-2 font-mono text-xs">{g.path ?? '-'}</td>
                    <td className="px-4 py-2 text-xs">{g.scope ?? '-'}</td>
                    <td className="px-4 py-2 font-mono text-xs">{g.digest ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{formatDateTime(g.first)}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{formatDateTime(g.last)}</td>
                    <td className="max-w-[24rem] px-4 py-2 text-xs text-muted-foreground">{g.sampleMessage ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
