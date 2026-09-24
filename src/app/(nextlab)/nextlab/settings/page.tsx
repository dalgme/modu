import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getProgramSettings, listGroupsWithDocs, listLimits, listRates, listReportTemplates, listSurveyTemplates, listTags } from '@/lib/settings/data';
import { DEFAULT_ROUND_REPORT_TEMPLATE, ROUND_REPORT_PLACEHOLDERS, previewRoundReportHtml, resolveRoundReportTemplate, templateHasSign } from '@/lib/documents/round-report';
import { ProgramForm } from '@/components/settings/program-form';
import { GroupsManager } from '@/components/settings/groups-manager';
import { RatesLimits } from '@/components/settings/rates-limits';
import { GatesForm, WithholdingForm } from '@/components/settings/policy-forms';
import { ReportTemplatesManager } from '@/components/settings/report-templates-manager';
import { SurveyTemplatesManager } from '@/components/settings/survey-templates-manager';
import { TagsManager } from '@/components/settings/tags-manager';
import { StaffPermissionsForm } from '@/components/settings/staff-permissions-form';
import { MentorFormsManager, type MentorFormScope } from '@/components/settings/mentor-forms-manager';
import { getMentorFormSettings, templateSignedUrl } from '@/lib/mentor-forms/data';
import { listSupportTypes } from '@/lib/programs/data';
import { featureEnabled } from '@/lib/platform/features';
import { createAdminClient } from '@/lib/supabase/admin';
import { listCases, mapSuccessors } from '@/lib/data/cases';
import { AUDIT_PAGE_SIZE, countProgramAuditRows, listAuditActors, loadProgramAuditRows, parseAuditQuery } from '@/lib/audit/rows';
import { SUCCESSION_FILTERS, SuccessionPanel, type SuccessionFilter, type SuccessionMode, type SuccessorInfo } from '@/components/nextlab/succession-panel';
import { AuditTable } from '@/components/audit/audit-table';
import { SettingsTabSelect } from '@/components/nav/settings-tab-select';
import { BudgetForm } from '@/components/settings/budget-form';
import { MatchingRulesForm } from '@/components/settings/matching-rules-form';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'program', label: '행사 기본' },
  { key: 'groups', label: '사업그룹·필수서류' },
  { key: 'rates', label: '단가·한도' },
  { key: 'withholding', label: '정산(원천징수)' },
  { key: 'budget', label: '예산' },
  { key: 'matching', label: '매칭 규칙' },
  { key: 'gates', label: '종결 게이트·서명 정책' },
  { key: 'reports', label: '보고서 양식' },
  { key: 'survey', label: '만족도 양식' },
  { key: 'mentor-forms', label: '위촉 서식' },
  { key: 'tags', label: '키워드 사전' },
  { key: 'permissions', label: '담당 권한' },
  { key: 'succession', label: '승계 개설' },
  { key: 'audit', label: '감사 로그' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** 설정 탭 묶음 — 필수 준비(운영 시작 전) / 운영 정책 / 관리 */
const SETTING_GROUPS: { label: string; keys: string[]; extra?: { href: string; label: string } }[] = [
  { label: '필수 준비', keys: ['program', 'groups', 'rates', 'matching'] },
  { label: '운영 정책', keys: ['withholding', 'budget', 'gates', 'reports', 'survey', 'mentor-forms', 'tags'] },
  { label: '관리', keys: ['permissions', 'succession', 'audit'], extra: { href: '/nextlab/settings/sms-api', label: '문자 API' } },
];

/** 운영 설정 (docs/MODU-DESIGN.md §16) — 탭별 서버 렌더. 승계 개설·감사 로그도 미니탭 (P20) */
export default async function Page({ searchParams }: { searchParams: { tab?: string; source?: string; mode?: string; filter?: string; [k: string]: string | undefined } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  // 플랫폼 기능 플래그 (P15) — 비활성 기능의 탭은 노출하지 않는다
  const mentorFormsOn = featureEnabled(ctx.program.features, 'mentor_forms');
  const visibleTabs = TABS.filter((t) => t.key !== 'mentor-forms' || mentorFormsOn);
  const tab = (visibleTabs.find((t) => t.key === searchParams.tab)?.key ?? 'program') as TabKey;
  const program = await getProgramSettings(ctx.programId);
  if (!program) notFound();
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  let body: React.ReactNode = null;
  if (tab === 'program') body = <ProgramForm program={program} />;
  if (tab === 'groups') {
    const groups = await listGroupsWithDocs(ctx.programId);
    const avail: Record<string, boolean> = {};
    for (const g of groups) avail[g.id] = (await resolveRoundReportTemplate(ctx.programId, g.id)).hasMentorSign;
    body = <GroupsManager groups={groups} reportSignAvailable={avail} defaultRequiredRounds={program.default_required_rounds} canDelete={!ctx.grade || ctx.grade === 'pl'} />;
  }
  if (tab === 'rates') {
    const [rates, limits, groups] = await Promise.all([listRates(ctx.programId), listLimits(ctx.programId), listGroupsWithDocs(ctx.programId)]);
    body = <RatesLimits defaultGroupId={ctx.supportTypeId ?? null} rates={rates} limits={limits} groups={groups.map((g) => ({ id: g.id, name: g.name }))} today={today} />;
  }
  if (tab === 'withholding') body = <WithholdingForm program={program} />;
  if (tab === 'budget') {
    const groups = await listSupportTypes(ctx.programId);
    body = (
      <BudgetForm
        value={{
          programBudget: program.mentoring_budget === null ? null : Number(program.mentoring_budget),
          groups: groups.map((g) => ({ id: g.id, name: g.name, budget: g.mentoring_budget === null ? null : Number(g.mentoring_budget) })),
        }}
      />
    );
  }
  if (tab === 'matching') {
    const groups = await listSupportTypes(ctx.programId);
    body = <MatchingRulesForm value={{ groups: groups.map((g) => ({ id: g.id, name: g.name, code: g.code, maxMenteesPerMentor: g.max_mentees_per_mentor ?? 2 })) }} />;
  }
  if (tab === 'gates') {
    const tpl = await resolveRoundReportTemplate(ctx.programId, null);
    body = <GatesForm program={program} programTemplateHasMentorSign={tpl.hasMentorSign} />;
  }
  if (tab === 'reports') {
    const [templates, groups] = await Promise.all([listReportTemplates(ctx.programId), listGroupsWithDocs(ctx.programId)]);
    const b = { programName: ctx.branding.programName, clientName: ctx.branding.clientName, operatorName: ctx.branding.operatorName };
    const previews: Record<string, string> = { __default__: previewRoundReportHtml(DEFAULT_ROUND_REPORT_TEMPLATE, b) };
    for (const t of templates) previews[t.id] = previewRoundReportHtml(t.html_content, b);
    body = (
      <ReportTemplatesManager
        templates={templates.map((t) => ({ ...t, field_mapping: { has_sign_mentor: templateHasSign(t.html_content, 'mentor') } }))}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        placeholders={ROUND_REPORT_PLACEHOLDERS}
        defaultHtml={DEFAULT_ROUND_REPORT_TEMPLATE}
        previews={previews}
      />
    );
  }
  if (tab === 'survey') {
    const [templates, groups] = await Promise.all([listSurveyTemplates(ctx.programId), listGroupsWithDocs(ctx.programId)]);
    body = <SurveyTemplatesManager templates={templates} groups={groups.map((g) => ({ id: g.id, name: g.name }))} />;
  }
  if (tab === 'mentor-forms' && mentorFormsOn) {
    const [groups, { data: subs }] = await Promise.all([
      listSupportTypes(ctx.programId),
      createAdminClient().from('mentor_form_submissions').select('form_key').eq('program_id', ctx.programId),
    ]);
    const countOf = new Map<string, number>();
    for (const s of subs ?? []) countOf.set(s.form_key, (countOf.get(s.form_key) ?? 0) + 1);
    const scopes: MentorFormScope[] = [];
    for (const sc of [{ id: null as string | null, name: '행사 공통' }, ...groups.map((g) => ({ id: g.id as string | null, name: g.name }))]) {
      const settings = await getMentorFormSettings(ctx.programId, sc.id);
      const items = [];
      for (const s of settings) {
        items.push({
          formKey: s.formKey,
          enabled: s.enabled,
          method: s.method,
          title: s.title,
          content: s.content,
          defined: s.defined,
          templateName: s.templateName,
          templateUrl: s.templatePath ? await templateSignedUrl(s.templatePath, s.templateName) : null,
          submittedCount: countOf.get(s.formKey) ?? 0,
        });
      }
      scopes.push({ id: sc.id, name: sc.name, items });
    }
    body = <MentorFormsManager scopes={scopes} />;
  }
  if (tab === 'tags') body = <TagsManager tags={await listTags(ctx.programId)} />;
  if (tab === 'permissions') body = <StaffPermissionsForm override={ctx.program.staff_permissions} canEdit={!ctx.grade || ctx.grade === 'pl'} />;
  if (tab === 'succession') {
    const groups = await listSupportTypes(ctx.programId);
    const mode: SuccessionMode = searchParams.mode === 'relocation' ? 'relocation' : 'succession';
    // 원천 그룹 기본값 = 현재 범위 그룹 (P30)
    const source = groups.find((g) => g.id === searchParams.source)?.id ?? groups.find((g) => g.id === ctx.supportTypeId)?.id ?? groups[0]?.id ?? '';
    const filterKey: SuccessionFilter = mode === 'relocation' ? 'withdrawn' : (SUCCESSION_FILTERS.find((f) => f.key === searchParams.filter)?.key ?? 'completed');
    const statuses = SUCCESSION_FILTERS.find((f) => f.key === filterKey)?.statuses ?? null;
    const cases = mode === 'relocation'
      ? await listCases({ programId: ctx.programId, status: 'withdrawn' })
      : source ? await listCases({ programId: ctx.programId, supportTypeId: source, statuses: statuses ?? undefined }) : [];
    const succMap = await mapSuccessors(cases.map((c) => c.id));
    const successors: Record<string, SuccessorInfo> = {};
    succMap.forEach((v, k) => { successors[k] = { caseId: v.caseId, supportTypeName: v.supportTypeName, status: v.status }; });
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">이전 단계 그룹의 멘티를 다음 그룹으로 승계하거나, 중도 종료(탈락) 멘티를 새 그룹에 재배치합니다. 새 케이스를 만들고 이전 케이스를 연결(predecessor)하며, 이전 그룹의 회차·서류·정산은 그대로 보존됩니다.</p>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">사업그룹이 없습니다.</p>
        ) : (
          <SuccessionPanel
            groups={groups.map((g) => ({ id: g.id, name: g.name, code: g.code, status: g.status, predecessor_support_type_id: g.predecessor_support_type_id }))}
            sourceGroupId={source}
            cases={cases}
            successors={successors}
            mode={mode}
            filter={filterKey}
          />
        )}
      </div>
    );
  }
  if (tab === 'audit') {
    // 기간·수행자·구분·대상 id 서버 필터 + 페이지 (P31)
    const aq = parseAuditQuery(searchParams);
    const [rows, total, actors] = await Promise.all([loadProgramAuditRows(ctx.programId, aq), countProgramAuditRows(ctx.programId, aq), listAuditActors(ctx.programId)]);
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{ctx.program.name} 의 관리자 액션 이력 (INSERT-only · 위변조 방지). 기간·수행자·구분으로 서버에서 조회합니다 (한 페이지 200건). [소스] 를 누르면 원본 로그를 봅니다.</p>
        <AuditTable rows={rows} server={{ from: aq.from ?? null, to: aq.to ?? null, actor: aq.actor ?? null, actionPrefix: aq.actionPrefix ?? null, entityId: aq.entityId ?? null, q: aq.q ?? null, total, page: Math.floor((aq.offset ?? 0) / AUDIT_PAGE_SIZE) + 1, pageSize: AUDIT_PAGE_SIZE, actors, exportHref: '/api/nextlab/audit-export' }} />
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">운영 설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ctx.program.name} — 저장 즉시 이 행사 전체에 반영됩니다. 숫자 한도는 적용일 이력으로 쌓이며 과거 정산은 바뀌지 않습니다.</p>
      </div>
      {/* (P31) 폰: 3묶음 optgroup 셀렉트 — 칩 14개가 화면을 다 차지하지 않게 */}
      <SettingsTabSelect
        value={tab}
        groups={SETTING_GROUPS.map((g) => ({
          label: g.label,
          items: [
            ...visibleTabs.filter((t) => g.keys.includes(t.key)).map((t) => ({ key: t.key, label: t.label, href: `/nextlab/settings?tab=${t.key}` })),
            ...(g.extra ? [{ key: `extra:${g.extra.href}`, label: g.extra.label, href: g.extra.href }] : []),
          ],
        })).filter((g) => g.items.length > 0)}
      />
      {/* 탭을 3묶음으로 — 처음 쓰는 담당자가 "먼저 해야 할 것"을 구분하도록 (P28). 폰에서는 위 셀렉트가 대신한다 (P31) */}
      <nav className="hidden flex-col gap-1.5 rounded-xl border bg-background p-3 sm:flex" aria-label="운영 설정 메뉴">
        {SETTING_GROUPS.map((g) => {
          const items = visibleTabs.filter((t) => g.keys.includes(t.key));
          if (items.length === 0 && !g.extra) return null;
          return (
            <div key={g.label} className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{g.label}</span>
              {items.map((t) => (
                <Link key={t.key} href={`/nextlab/settings?tab=${t.key}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
                  {t.label}
                </Link>
              ))}
              {g.extra && (
                <Link href={g.extra.href} className="rounded-full bg-muted px-3 py-1 text-xs font-semibold hover:bg-accent">
                  {g.extra.label}
                </Link>
              )}
            </div>
          );
        })}
      </nav>
      {body}
    </main>
  );
}
