import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCampaignDetail } from '@/lib/surveys/campaigns';
import { CampaignActions } from '@/components/surveys/campaign-detail-panel';
import { formatDateTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** 조사 상세 — 실시간 분석(응답률·문항별 집계) + 대상자·미참여자 + 독려 문자 */
export default async function Page({ params }: { params: { id: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const d = await getCampaignDetail(params.id);
  if (!d || d.campaign.program_id !== ctx.programId) notFound();
  const responded = d.targets.filter((t) => t.responded_at);
  const unresponded = d.targets.filter((t) => !t.responded_at);
  const rate = d.targets.length ? Math.round((responded.length / d.targets.length) * 100) : 0;
  const bySms = responded.filter((t) => t.channel === 'sms').length;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <Link href="/nextlab/surveys" className="text-sm text-muted-foreground hover:underline">← 조사 관리</Link>
        <h1 className="mt-1 text-2xl font-semibold">{d.campaign.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {d.templateName} · {d.groupName ?? '행사 전체'} · {formatDateTime(d.campaign.starts_at)} ~ {d.campaign.ends_at ? formatDateTime(d.campaign.ends_at) : '수동 종료'} ·{' '}
          <span className={d.campaign.status === 'open' ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}>{d.campaign.status === 'open' ? '진행 중' : '종료'}</span>
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">응답률</p><p className="mt-1 text-2xl font-semibold tabular-nums">{rate}%</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${rate}%` }} /></div></div>
        <div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">응답 / 대상</p><p className="mt-1 text-2xl font-semibold tabular-nums">{responded.length} / {d.targets.length}</p><p className="mt-0.5 text-[11px] text-muted-foreground">문자 응답 {bySms} · 플랫폼 응답 {responded.length - bySms}</p></div>
        <div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">미참여</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${unresponded.length ? 'text-amber-700' : ''}`}>{unresponded.length}명</p></div>
        <div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">척도 평균</p><p className="mt-1 text-2xl font-semibold tabular-nums">{d.scoreAvg ?? '-'}</p></div>
      </section>

      <CampaignActions campaignId={d.campaign.id} status={d.campaign.status} unresponded={unresponded.length} />

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">문항별 실시간 분석</h2>
        {d.aggregates.map((a, i) => (
          <div key={a.id} className="rounded-xl border bg-background p-4">
            <p className="text-sm font-semibold">{i + 1}. {a.label} <span className="ml-1 text-xs font-normal text-muted-foreground">응답 {a.n}건</span></p>
            {a.qtype === 'scale' && (
              <div className="mt-2 flex flex-col gap-1">
                <p className="text-sm">평균 <b className="tabular-nums">{a.avg ?? '-'}</b></p>
                <div className="flex items-end gap-1">
                  {(a.distribution ?? []).map((dd) => {
                    const max = Math.max(1, ...(a.distribution ?? []).map((x) => x.count));
                    return (
                      <div key={dd.value} className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] tabular-nums text-muted-foreground">{dd.count}</span>
                        <div className="w-8 rounded-t bg-primary/70" style={{ height: `${(dd.count / max) * 56 + 2}px` }} />
                        <span className="text-[11px] tabular-nums">{dd.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {(a.qtype === 'single' || a.qtype === 'multi') && (
              <div className="mt-2 flex flex-col gap-1">
                {(a.choices ?? []).map((cItem) => {
                  const max = Math.max(1, ...(a.choices ?? []).map((x) => x.count));
                  return (
                    <div key={cItem.id} className="flex items-center gap-2 text-sm">
                      <span className="w-40 truncate">{cItem.label}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded bg-muted"><div className="h-full bg-primary/70" style={{ width: `${(cItem.count / max) * 100}%` }} /></div>
                      <span className="w-10 text-right tabular-nums text-xs">{cItem.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {a.qtype === 'rank' && (
              <table className="mt-2 w-full max-w-md text-xs">
                <thead><tr className="border-b text-muted-foreground"><th className="py-1 text-left">보기</th><th className="py-1 text-right">1순위 횟수</th><th className="py-1 text-right">가중 점수</th></tr></thead>
                <tbody>
                  {[...(a.choices ?? [])].sort((x, y) => (y.weighted ?? 0) - (x.weighted ?? 0)).map((cItem) => (
                    <tr key={cItem.id} className="border-b last:border-0"><td className="py-1">{cItem.label}</td><td className="py-1 text-right tabular-nums">{cItem.count}</td><td className="py-1 text-right tabular-nums">{cItem.weighted ?? 0}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            {a.qtype === 'text' && (
              <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-auto text-sm">
                {(a.texts ?? []).map((t, ti) => <li key={ti} className="rounded bg-muted/50 px-2 py-1">{t}</li>)}
                {(a.texts ?? []).length === 0 && <li className="text-xs text-muted-foreground">응답 없음</li>}
              </ul>
            )}
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">대상자 ({d.targets.length}명)</h2>
        <div className="overflow-x-auto rounded-xl border bg-background">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">이름</th><th className="px-3 py-2">역할</th><th className="px-3 py-2">응답</th><th className="px-3 py-2">경로</th><th className="px-3 py-2 text-right">독려 횟수</th><th className="px-3 py-2">마지막 발송</th>
              </tr>
            </thead>
            <tbody>
              {[...unresponded, ...responded].map((t) => (
                <tr key={t.id} className={`border-b last:border-0 ${!t.responded_at ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-3 py-1.5">{t.name}{!t.phone && <span className="ml-1 text-[10px] text-destructive">휴대폰 없음</span>}</td>
                  <td className="px-3 py-1.5 text-xs">{t.role === 'mentee' ? '멘티' : t.role === 'mentor' ? '멘토' : t.role}</td>
                  <td className="px-3 py-1.5 text-xs">{t.responded_at ? <span className="text-emerald-700">{formatDateTime(t.responded_at)}</span> : <span className="font-semibold text-amber-700">미참여</span>}</td>
                  <td className="px-3 py-1.5 text-xs">{t.responded_at ? (t.channel === 'sms' ? '문자 링크' : '플랫폼') : '-'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-xs">{t.notify_count}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{t.last_notified_at ? formatDateTime(t.last_notified_at) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
