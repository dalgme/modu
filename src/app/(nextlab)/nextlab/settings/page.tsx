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
import { listCases } from '@/lib/data/cases';
import { loadProgramAuditRows } from '@/lib/audit/rows';
import { SuccessionPanel } from '@/components/nextlab/succession-panel';
import { AuditTable } from '@/components/audit/audit-table';
import { BudgetForm } from '@/components/settings/budget-form';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'program', label: '행사 기본' },
  { key: 'groups', label: '사업그룹·필수서류' },
  { key: 'rates', label: '단가·한도' },
  { key: 'withholding', label: '정산(원천징수)' },
  { key: 'budget', label: '예산' },
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

/** 운영 설정 (docs/MODU-DESIGN.md §16) — 탭별 서버 렌더. 승계 개설·감사 로그도 미니탭 (P20) */
export default async function Page({ searchParams }: { searchParams: { tab?: string; source?: string } }) {
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
    body = <GroupsManager groups={groups} reportSignAvailable={avail} />;
  }
  if (tab === 'rates') {
    const [rates, limits, groups] = await Promise.all([listRates(ctx.programId), listLimits(ctx.programId), listGroupsWithDocs(ctx.programId)]);
    body = <RatesLimits rates={rates} limits={limits} groups={groups.map((g) => ({ id: g.id, name: g.name }))} today={today} />;
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
    const source = groups.find((g) => g.id === searchParams.source)?.id ?? groups[0]?.id ?? '';
    const cases = source ? await listCases({ programId: ctx.programId, supportTypeId: source }) : [];
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">이전 단계 그룹의 멘티를 다음 그룹으로 승계합니다. 새 케이스를 만들고 이전 케이스를 연결(predecessor)하며, 이전 그룹의 회차·서류·정산은 그대로 보존됩니다.</p>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">사업그룹이 없습니다.</p>
        ) : (
          <SuccessionPanel
            groups={groups.map((g) => ({ id: g.id, name: g.name, code: g.code, status: g.status, predecessor_support_type_id: g.predecessor_support_type_id }))}
            sourceGroupId={source}
            cases={cases}
          />
        )}
      </div>
    );
  }
  if (tab === 'audit') {
    const rows = await loadProgramAuditRows(ctx.programId);
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{ctx.program.name} 의 관리자 액션 이력 (INSERT-only · 위변조 방지). 최근 200건. [소스] 를 누르면 원본 로그를 봅니다.</p>
        <AuditTable rows={rows} />
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">운영 설정</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ctx.program.name} — 저장 즉시 이 행사 전체에 반영됩니다. 숫자 한도는 적용일 이력으로 쌓이며 과거 정산은 바뀌지 않습니다.</p>
      </div>
      <nav className="flex flex-wrap gap-1.5">
        {visibleTabs.map((t) => (
          <Link key={t.key} href={`/nextlab/settings?tab=${t.key}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
            {t.label}
          </Link>
        ))}
        <Link href="/nextlab/settings/sms-api" className="rounded-full bg-muted px-3 py-1 text-xs font-semibold hover:bg-accent">
          문자 API
        </Link>
      </nav>
      {body}
    </main>
  );
}
