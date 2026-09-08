import Link from 'next/link';

import { getPlatformOverview } from '@/lib/platform/data';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import { formatDateTime, formatNumber } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

function Tile({ label, value, sub, href, tone }: { label: string; value: string; sub?: string; href?: string; tone?: 'warn' | 'ok' }) {
  const body = (
    <div className={`rounded-xl border bg-background p-4 ${tone === 'warn' ? 'border-amber-300' : ''} ${href ? 'transition-colors hover:border-violet-400' : ''}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'warn' ? 'text-amber-700' : ''}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const STATUS_ORDER: CaseStatus[] = ['registered', 'mentor_assigned', 'in_progress', 'reassignment_pending', 'closure_requested', 'revision_requested', 'settlement_pending', 'settlement_batched', 'closed', 'withdrawn'];

/** 플랫폼 통합 현황 — 모든 행사의 규모·진행·처리 대기·정산을 한 화면에 */
export default async function Page() {
  const o = await getPlatformOverview();
  const won = (n: number) => `${formatNumber(n)}원`;
  const staleQueue = o.notifications.pending > 0 && (!o.notifications.lastSentAt || Date.now() - new Date(o.notifications.lastSentAt).getTime() > 30 * 60_000);
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">플랫폼 통합 현황</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          이 배포에 개설된 모든 행사를 한눈에 봅니다. 행사·그룹의 세부 설정과 일상 운영은 각 행사의 운영사가, 행사 개설·계정 통합·시스템은 여기서 관리합니다.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="행사" value={`${o.programs.active}`} sub={`진행 중 ${o.programs.active} · 종료 ${o.programs.ended}`} href="/platform/programs" />
        <Tile label="계정" value={formatNumber(o.users.institution + o.users.nextlab + o.users.mentor + o.users.mentee)} sub={`발주처 ${o.users.institution} · 운영사 ${o.users.nextlab} · 멘토 ${o.users.mentor} · 멘티 ${o.users.mentee} · 비활성 ${o.users.inactive}`} href="/platform/users" />
        <Tile label="케이스" value={formatNumber(o.cases.total)} sub={`진행 중 ${o.cases.inProgress} · 종결 ${o.cases.closed} · 중도 종료 ${o.cases.withdrawn}`} />
        <Tile label="정산 (실지급액)" value={won(o.settlements.pendingNet)} sub={`지급 대기 · 품의/확인 ${won(o.settlements.batchedNet)} · 지급 완료 ${won(o.settlements.paidNet)}`} />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Tile label="알림 큐 대기" value={formatNumber(o.notifications.pending)} sub={o.notifications.lastSentAt ? `마지막 발송 ${formatDateTime(o.notifications.lastSentAt)}` : '아직 발송 이력 없음'} href="/platform/system" tone={staleQueue ? 'warn' : undefined} />
        <Tile label="최근 7일 발송 / 실패" value={`${formatNumber(o.notifications.sent7d)} / ${formatNumber(o.notifications.failed7d)}`} href="/platform/system" tone={o.notifications.failed7d > 0 ? 'warn' : undefined} />
        <Tile label="플랫폼 관리자" value={`${o.users.platformAdmins}`} sub="행사 개설·계정 통합·시스템 권한" href="/platform/admins" />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-end justify-between">
          <h2 className="text-base font-semibold">행사별 진행 현황</h2>
          <Link href="/platform/programs" className="text-xs text-violet-700 hover:underline">행사 관리 →</Link>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">행사</th>
                <th className="px-3 py-2 text-right">그룹</th>
                <th className="px-3 py-2 text-right">케이스</th>
                <th className="px-3 py-2">상태 분포</th>
                <th className="px-3 py-2">처리 대기</th>
                <th className="px-3 py-2 text-right">지급 대기액</th>
                <th className="px-3 py-2">계정 (운영/발주/멘토/멘티)</th>
              </tr>
            </thead>
            <tbody>
              {o.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    행사가 없습니다. <Link href="/platform/new" className="text-violet-700 underline">행사 개설</Link>
                  </td>
                </tr>
              )}
              {o.rows.map((r) => {
                const waits = [r.pending.reassignment && `재배정 ${r.pending.reassignment}`, r.pending.review && `검수 ${r.pending.review}`, r.pending.settlement && `지급 ${r.pending.settlement}`].filter(Boolean) as string[];
                return (
                  <tr key={r.program.id} className={`border-b last:border-0 ${r.program.status !== 'active' ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2">
                      <Link href={`/platform/programs/${r.program.id}`} className="font-medium hover:underline">{r.program.name}</Link>
                      <p className="text-[11px] text-muted-foreground">{r.program.client_name} · {r.program.operator_name}{r.program.status !== 'active' ? ' · 종료' : ''}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.groups}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.cases}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {STATUS_ORDER.filter((s) => r.byStatus[s]).map((s) => (
                          <span key={s} className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">
                            {CASE_STATUS_META[s].short} {r.byStatus[s]}
                          </span>
                        ))}
                        {r.cases === 0 && <span className="text-[11px] text-muted-foreground">-</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">{waits.length ? <span className="font-medium text-amber-700">{waits.join(' · ')}</span> : <span className="text-muted-foreground">없음</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{won(r.settlementPendingNet)}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{r.members.nextlab} / {r.members.institution} / {r.members.mentor} / {r.members.mentee}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-dashed bg-background/60 p-4 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">역할 분담</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li><b>플랫폼 통합관리자(여기)</b>: 행사 개설·복제·종료, 첫 운영사 계정 발급, 전 행사 계정 조회·비밀번호 재발급·활성화·행사 소속, 플랫폼 관리자 지정, 통합 감사로그, 시스템 상태.</li>
          <li><b>행사 운영사</b>: 그룹·필수서류·단가·한도·정산 정책·보고서 양식·만족도·키워드 등 행사 안 모든 설정과 일상 운영(멘티 등록·배정·검수·정산·문자).</li>
          <li>플랫폼 관리자 계정은 <b>통합관리 전용</b>입니다. 행사·그룹 소속을 가질 수 없고(DB 에서 차단), 행사 안 업무는 그 행사의 운영사·발주처 계정으로 합니다.</li>
        </ul>
      </section>
    </main>
  );
}
