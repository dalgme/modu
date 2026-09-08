import { getSystemStatus } from '@/lib/platform/data';
import { formatDateTime, formatNumber } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-red-500'}`} />;
}

/** 시스템 상태 — 배포·설정 존재 여부·Cron 생존·문자/AI 구성. 값은 노출하지 않고 존재 여부만 본다. */
export default async function Page() {
  const s = await getSystemStatus();
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
    </main>
  );
}
