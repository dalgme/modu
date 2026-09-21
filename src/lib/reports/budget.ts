import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 멘토링 예산 집행 현황 (P22) — 예산은 지급총액(gross, 원천징수 공제 전) 기준.
 *  확정 = 정산 스냅샷 gross 합(취소 제외) / 예상 = 아직 정산에 묶이지 않은 이행(보고서 등록) 회차 단가 합.
 *  화면·엑셀이 전부 이 함수를 쓴다 — 두 군데서 각자 계산하지 말 것.
 */
export interface BudgetRow {
  id: string | null; // null = 행사 전체
  name: string;
  budget: number | null;
  confirmed: number;
  forecast: number;
}

export interface BudgetOverview {
  total: BudgetRow;
  groups: BudgetRow[];
}

export async function computeBudgetOverview(programId: string, supportTypeId?: string | null): Promise<BudgetOverview> {
  const admin = createAdminClient();
  const [{ data: program }, { data: groups }, { data: cases }] = await Promise.all([
    admin.from('programs').select('name, mentoring_budget').eq('id', programId).maybeSingle(),
    admin.from('support_types').select('id, name, mentoring_budget').eq('program_id', programId).order('sort_order'),
    admin.from('cases').select('id, support_type_id').eq('program_id', programId),
  ]);
  const caseGroup = new Map((cases ?? []).map((c) => [c.id, c.support_type_id]));
  const caseIds = Array.from(caseGroup.keys());

  const confirmedByGroup = new Map<string, number>();
  const forecastByGroup = new Map<string, number>();
  if (caseIds.length) {
    const [{ data: settlements }, { data: logs }] = await Promise.all([
      admin.from('settlements').select('case_id, gross').in('case_id', caseIds).neq('status', 'canceled'),
      admin.from('mentoring_logs').select('case_id, amount_snapshot').in('case_id', caseIds).not('report_registered_at', 'is', null).is('settlement_id', null),
    ]);
    for (const s of settlements ?? []) {
      const g = caseGroup.get(s.case_id);
      if (g) confirmedByGroup.set(g, (confirmedByGroup.get(g) ?? 0) + Number(s.gross));
    }
    for (const l of logs ?? []) {
      const g = caseGroup.get(l.case_id);
      if (g) forecastByGroup.set(g, (forecastByGroup.get(g) ?? 0) + Number(l.amount_snapshot));
    }
  }

  const groupRows: BudgetRow[] = (groups ?? [])
    .filter((g) => !supportTypeId || g.id === supportTypeId)
    .map((g) => ({
      id: g.id,
      name: g.name,
      budget: g.mentoring_budget === null ? null : Number(g.mentoring_budget),
      confirmed: confirmedByGroup.get(g.id) ?? 0,
      forecast: forecastByGroup.get(g.id) ?? 0,
    }));

  const total: BudgetRow = supportTypeId
    ? (groupRows[0] ?? { id: supportTypeId, name: '-', budget: null, confirmed: 0, forecast: 0 })
    : {
        id: null,
        name: program?.name ?? '행사 전체',
        budget: program?.mentoring_budget === null || program?.mentoring_budget === undefined ? null : Number(program.mentoring_budget),
        confirmed: groupRows.reduce((s, g) => s + g.confirmed, 0),
        forecast: groupRows.reduce((s, g) => s + g.forecast, 0),
      };

  return { total, groups: supportTypeId ? [] : groupRows };
}
