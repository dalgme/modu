import Link from 'next/link';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { listCampaigns } from '@/lib/surveys/campaigns';
import { listSurveyTemplates } from '@/lib/settings/data';
import { CampaignCreateForm, type MemberOpt } from '@/components/surveys/campaign-create-form';
import { formatDateTime } from '@/lib/utils/format';
import { satisfactionOverview } from '@/lib/surveys/satisfaction';
import { SatisfactionRemindButton } from '@/components/surveys/satisfaction-panel';
import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = { draft: '준비', open: '진행 중', closed: '종료' };

/** 조사 관리 — 여러 조사를 개설하고 실시간 응답률을 본다 */
export default async function Page() {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const admin = createAdminClient();
  const [campaigns, templates, sat, { data: groups }, { data: memberships }] = await Promise.all([
    listCampaigns(ctx.programId, ctx.supportTypeId ?? null),
    listSurveyTemplates(ctx.programId),
    satisfactionOverview(ctx.programId, ctx.supportTypeId ?? null),
    admin.from('support_types').select('id, name').eq('program_id', ctx.programId).order('sort_order'),
    admin.from('program_members').select('user_id, role').eq('program_id', ctx.programId).eq('is_active', true).in('role', ['mentee', 'mentor']),
  ]);
  const gName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const memberIds = (memberships ?? []).map((m) => m.user_id);
  const [{ data: users }, { data: cases }, { data: roster }] = await Promise.all([
    memberIds.length ? admin.from('users').select('id, name, phone').in('id', memberIds) : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null }[] }),
    admin.from('cases').select('mentee_id, support_type_id').eq('program_id', ctx.programId).not('mentee_id', 'is', null),
    admin.from('support_type_members').select('user_id, support_type_id').eq('is_active', true),
  ]);
  const uById = new Map((users ?? []).map((u) => [u.id, u]));
  const groupsOf = new Map<string, Set<string>>();
  for (const c of cases ?? []) {
    if (!c.mentee_id) continue;
    (groupsOf.get(c.mentee_id) ?? groupsOf.set(c.mentee_id, new Set()).get(c.mentee_id)!).add(c.support_type_id);
  }
  for (const r of roster ?? []) {
    if (!gName.has(r.support_type_id)) continue;
    (groupsOf.get(r.user_id) ?? groupsOf.set(r.user_id, new Set()).get(r.user_id)!).add(r.support_type_id);
  }
  const members: MemberOpt[] = (memberships ?? [])
    .map((m) => {
      const u = uById.get(m.user_id);
      return u ? { id: u.id, name: u.name, role: m.role as string, phone: u.phone, groupNames: Array.from(groupsOf.get(u.id) ?? []).map((g) => gName.get(g) ?? '').filter(Boolean) } : null;
    })
    .filter((x): x is MemberOpt => !!x)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">조사 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name}{ctx.group ? ` · ${ctx.group.name}` : ''} — 만족도·사전선호도·중간 점검 등 여러 조사를 개설하고, 실시간 응답률·문항별 분석과 미참여자 독려까지 한 곳에서 관리합니다. 종결 만족도(케이스별 자동 조사)의 실시간 분석은 리포트 탭에 있습니다.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">조사</th>
              <th className="px-3 py-2">양식 · 범위</th>
              <th className="px-3 py-2">기간</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2 text-right">응답 / 대상</th>
              <th className="px-3 py-2 text-right">응답률</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">개설된 조사가 없습니다. 아래에서 첫 조사를 개설하세요.</td></tr>}
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-2"><Link href={`/nextlab/surveys/${c.id}`} className="font-medium text-primary hover:underline">{c.title}</Link></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{c.templateName}{c.groupName ? ` · ${c.groupName}` : ' · 행사 전체'}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{formatDateTime(c.startsAt)} ~ {c.endsAt ? formatDateTime(c.endsAt) : '수동 종료'}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.status === 'open' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{STATUS_LABEL[c.status] ?? c.status}</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{c.responded} / {c.targets}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{c.targets ? Math.round((c.responded / c.targets) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>


      <section className="flex flex-col gap-3 rounded-xl border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">종결 만족도 실시간 분석</h2>
            <p className="text-xs text-muted-foreground">종결 요청 이상 케이스의 멘티가 대상인 자동 조사{sat.templateName ? ` · 양식 ${sat.templateName}` : ''}. 멘티는 로그인 후 [만족도 조사]에서 응답합니다.</p>
          </div>
          <SatisfactionRemindButton unresponded={sat.unresponded.length} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">응답률</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{sat.eligible ? Math.round((sat.responded / sat.eligible) * 100) : 0}%</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">응답 / 대상</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{sat.responded} / {sat.eligible}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">미응답</p><p className={`mt-0.5 text-xl font-semibold tabular-nums ${sat.unresponded.length ? 'text-amber-700' : ''}`}>{sat.unresponded.length}명</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">척도 평균</p><p className="mt-0.5 text-xl font-semibold tabular-nums">{sat.scoreAvg ?? '-'}</p></div>
        </div>
        {sat.aggregates.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {sat.aggregates.map((a, i) => (
              <div key={a.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{i + 1}. {a.label} <span className="ml-1 text-xs font-normal text-muted-foreground">n={a.n}</span></p>
                {a.qtype === 'scale' && <p className="mt-1 tabular-nums">평균 <b>{a.avg ?? '-'}</b>{a.distribution ? ` · 분포 ${a.distribution.map((d) => d.count).join('/')}` : ''}</p>}
                {(a.qtype === 'single' || a.qtype === 'multi') && <p className="mt-1 text-xs text-muted-foreground">{(a.choices ?? []).map((c) => `${c.label} ${c.count}`).join(' · ')}</p>}
                {a.qtype === 'rank' && <p className="mt-1 text-xs text-muted-foreground">{[...(a.choices ?? [])].sort((x, y) => (y.weighted ?? 0) - (x.weighted ?? 0)).slice(0, 3).map((c, ri) => `${ri + 1}위 ${c.label}`).join(' · ')}</p>}
                {a.qtype === 'text' && <p className="mt-1 text-xs text-muted-foreground">주관식 {a.texts?.length ?? 0}건 (상세는 케이스별 응답)</p>}
              </div>
            ))}
          </div>
        )}
        {sat.unresponded.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-amber-700">미응답 멘티 {sat.unresponded.length}명 보기</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {sat.unresponded.map((u) => (
                <li key={u.caseId} className="rounded bg-amber-50/60 px-2 py-1 text-xs">
                  {u.name} · {u.businessName} <span className="text-muted-foreground">({CASE_STATUS_META[u.status as CaseStatus]?.short ?? u.status}{u.phone ? '' : ' · 휴대폰 없음'})</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <CampaignCreateForm
        templates={templates.map((t) => ({ id: t.id, name: `${t.name} v${t.version}`, groupName: t.support_type_id ? (gName.get(t.support_type_id) ?? null) : null }))}
        groups={(groups ?? []).map((g) => ({ id: g.id, name: g.name }))}
        members={members}
      />
    </main>
  );
}
