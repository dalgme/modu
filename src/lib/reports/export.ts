import 'server-only';

import * as XLSX from 'xlsx';

import { periodLabel, type ProgramMetrics } from '@/lib/reports/metrics';
import type { TrendMonth } from '@/lib/reports/trend';
import type { MentorMatchRow } from '@/lib/data/matching-lists';
import type { CaseListItem } from '@/lib/data/cases';
import type { SettlementItem } from '@/lib/data/settlements';
import type { DelayedCase } from '@/lib/reports/delays-shared';
import { DELAY_LABELS } from '@/lib/reports/delays-shared';
import type { BudgetOverview } from '@/lib/reports/budget';
import { CASE_STATUSES, CASE_STATUS_META } from '@/types/case-status';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { SETTLEMENT_STATUS_LABELS } from '@/lib/settlement/labels';
import { excelFileName, kstDate, kstDateTime, sheetName, sheetWithMeta, workbookBuffer } from '@/lib/excel/sheet';

/** 리포트 탭 한국어 라벨 (파일명·시트명) */
export const REPORT_TAB_LABELS: Record<string, string> = {
  overview: '개요',
  trend: '월별추이',
  cases: '진행현황',
  mentors: '멘토실적',
  groups: '그룹실적',
  settlement: '정산',
  survey: '만족도',
};

/** 정산 구분 라벨 */
export const SETTLEMENT_KIND_LABELS: Record<string, string> = { closure: '종결 정산', partial: '부분 정산' };

/** 엑셀 파일명 — `{행사}_{그룹|전체}_리포트_{탭}[_기간]_{YYYY-MM-DD KST}.xlsx` (라우트가 사용) */
export function reportFileName(programName: string, tab: string, m: ProgramMetrics, scopeName?: string | null): string {
  const p = m.scope.period;
  const period = p && (p.from || p.to) ? `_${p.from ?? ''}~${p.to ?? ''}` : '';
  return excelFileName(programName, scopeName ?? null, `리포트_${REPORT_TAB_LABELS[tab] ?? tab}${period}`);
}

export interface ReportExportExtra {
  trend?: TrendMonth[];
  mentorProgress?: MentorMatchRow[];
  /** 지연 케이스 (개요) */
  delays?: DelayedCase[];
  /** 예산 집행 (개요) */
  budget?: BudgetOverview;
  /** 발주처 = 운영사 평가 컬럼 제외 */
  role?: 'nextlab' | 'institution';
  /** 범위 라벨 (메타) */
  scopeName?: string | null;
  /** 진행현황 표 필터 설명 (메타) */
  filterLabel?: string | null;
  /** 케이스별 고유번호·순위 (mentee_profiles) — 케이스 시트 컬럼 */
  caseExtras?: Record<string, { externalNo: string | null; rank: number | null }>;
}

/** 리포트 엑셀 — 탭별 시트 (수치는 metrics 한 곳에서). extra 로 월별 추이·멘토 진행현황·지연·예산 시트를 덧붙인다 (P30·P31) */
export function buildReportWorkbook(tab: string, m: ProgramMetrics, cases: CaseListItem[], settlements: SettlementItem[], programName: string, extra: ReportExportExtra = {}): Buffer {
  const wb = XLSX.utils.book_new();
  const period = periodLabel(m.scope.period);
  const institution = extra.role === 'institution';
  const meta = { 기준일: kstDateTime(m.scope.generatedAt), 범위: `${programName} · ${extra.scopeName ?? '행사 전체'}`, 필터: [period !== '전체 기간' ? `기간 ${period}` : null, extra.filterLabel].filter(Boolean).join(' · ') || undefined };
  const add = (name: string, header: string[], rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, sheetWithMeta(header, rows, meta), sheetName(name));

  if (tab === 'overview') {
    const p = m.performance;
    const b = m.backlog;
    const s = m.settlement;
    add('개요', ['구분', '항목', '값'], [
      ['수행 성과', '케이스', p.cases], ['수행 성과', '기간 내 신규', p.newCases], ['수행 성과', '기간 내 종결', p.closedCases], ['수행 성과', '이행 회차', p.roundsDone], ['수행 성과', '계획 회차', p.roundsPlanned], ['수행 성과', '완료 회차(정산 확정)', p.roundsCompleted], ['수행 성과', '종결', p.closed], ['수행 성과', '종결률', p.closureRate], ['수행 성과', '온라인 회차', p.onlineRounds], ['수행 성과', '오프라인 회차', p.offlineRounds],
      ['잔여 과업', '미배정', b.unassigned], ['잔여 과업', '잔여 회차', b.remainingRounds], ['잔여 과업', `정체(${b.stalledDays}일)`, b.stalled], ['잔여 과업', '검수 대기', b.reviewPending], ['잔여 과업', '보완 요청 중', b.revisionRequested], ['잔여 과업', '재배정 대기', b.reassignmentPending], ['잔여 과업', '미서명 회차', b.unsignedRounds], ['잔여 과업', '미응답 설문', b.unansweredSurveys], ['잔여 과업', '지급서류 미비 멘토', b.mentorsMissingDocs], ['잔여 과업', '미처리 요청', b.pendingRequests],
      ['정산', '예상(세전)', s.estimatedGross], ['정산', '지급 대기', s.pendingNet], ['정산', '품의 편성', s.batchedNet], ['정산', '정산 확인', s.confirmedNet], ['정산', '지급 완료', s.paidNet], ['정산', '원천징수 합계', s.withholdingTotal],
    ]);
  }
  if (tab === 'overview' || tab === 'cases') {
    add('진행현황 매트릭스', ['그룹', ...CASE_STATUSES.map((st) => CASE_STATUS_META[st].short), '합계', '이행 회차', '계획 회차'], m.groups.map((g) => [g.name, ...CASE_STATUSES.map((st) => g.byStatus[st]), g.cases, g.roundsDone, g.roundsPlanned]));
    add('케이스', ['기업(팀)', '멘티', '휴대폰', '고유번호', '순위', '그룹', '상태', '멘토', '이행 회차', '계획 회차', '필수 회차', '등록일'], cases.map((c) => {
      const ext = extra.caseExtras?.[c.id];
      return [c.business_name, c.owner_name, c.phone ?? '', ext?.externalNo ?? '', ext?.rank ?? '', c.supportTypeName ?? '', c.status === 'withdrawn' ? '중도 종료' : CASE_STATUS_META[c.status].short, c.mentorName ?? '', c.roundsDone, c.roundsPlanned, c.requiredRounds, kstDate(c.created_at)];
    }));
  }
  if (tab === 'overview' || tab === 'mentors') {
    const header = ['멘토', '담당', '활성', '이행 회차', '완료 회차', '온라인', '오프라인', '종결', '확정 실지급', '만족도', ...(institution ? [] : ['운영사 평가'])];
    add('멘토 실적', header, m.mentors.map((x) => [x.name, x.cases, x.activeCases, x.roundsDone, x.roundsCompleted, x.online, x.offline, x.closed, x.settledNet, x.surveyAvg ?? '', ...(institution ? [] : [x.reviewAvg ?? ''])]));
  }
  if (tab === 'overview' || tab === 'groups') {
    add('그룹 실적', ['코드', '그룹', '상태', '케이스', '이행 회차', '계획 회차', '종결', '승계 유입', '승계 유출', '재배치 유입', '재배치 유출', '만족도', '확정 실지급'], m.groups.map((g) => [g.code, g.name, g.status === 'active' ? '진행 중' : g.status === 'ended' ? '종료' : g.status, g.cases, g.roundsDone, g.roundsPlanned, g.closed, g.succeededFrom, g.succeededTo, g.relocatedFrom, g.relocatedTo, g.surveyAvg ?? '', g.settledNet]));
  }
  if (tab === 'overview' || tab === 'settlement') {
    const live = settlements.filter((s) => s.status !== 'canceled');
    const canceled = settlements.filter((s) => s.status === 'canceled');
    const header = ['멘토', '기업(팀)', '멘티', '그룹', '구분', '원천징수 방식', '회차', '지급총액', '소득금액', '소득세', '지방소득세', '원천징수', '실지급', '상태', '품의', '확정일'];
    const row = (s: SettlementItem) => [s.mentorName, s.businessName, s.ownerName, s.supportTypeName ?? '', SETTLEMENT_KIND_LABELS[s.kind] ?? s.kind, WITHHOLDING_LABELS[s.withholding_method as keyof typeof WITHHOLDING_LABELS] ?? s.withholding_method, s.roundCount, Number(s.gross), Number(s.taxable), Number(s.income_tax), Number(s.local_tax), Number(s.withholding), Number(s.net), SETTLEMENT_STATUS_LABELS[s.status] ?? s.status, s.batchTitle ?? '', kstDate(s.confirmed_at)];
    add('정산 건', header, live.map(row));
    if (canceled.length) add('취소된 정산', [...header, '취소일', '취소 사유'], canceled.map((s) => [...row(s), kstDate(s.canceled_at), s.cancel_reason ?? '']));
    add('방식별 소계', ['방식', '건수', '실지급'], [...m.settlement.byMethod.map((x) => [WITHHOLDING_LABELS[x.method as keyof typeof WITHHOLDING_LABELS] ?? x.method, x.count, x.net]), ['원천징수 합계', '', m.settlement.withholdingTotal]]);
  }
  if (tab === 'overview' || tab === 'survey') {
    add('만족도(그룹)', ['그룹', '평균', '응답 수'], m.evaluation.surveyByGroup.map((r) => [r.name, r.avg ?? '', r.n]));
    add('만족도(멘토)', ['멘토', '평균', '응답 수'], m.evaluation.surveyByMentor.map((r) => [r.name, r.avg ?? '', r.n]));
  }
  if ((tab === 'overview' || tab === 'trend') && extra.trend) {
    add('월별 추이', ['월', '이행 회차', '확정 지급총액', '신규 케이스', '종결 케이스'], extra.trend.map((t) => [t.month, t.rounds, t.settledGross, t.newCases, t.closedCases]));
  }
  if ((tab === 'overview' || tab === 'cases' || tab === 'mentors') && extra.mentorProgress) {
    add('멘토 진행현황', ['멘토', '소속', '담당 멘티', '이행 회차', '만족도', ...(institution ? [] : ['운영사 평가'])], extra.mentorProgress.map((r) => [r.mentorName, r.organization ?? '', r.mentees.map((x) => x.label).join(', '), r.roundsDone, r.surveyAvg ?? '', ...(institution ? [] : [r.reviewAvg ?? ''])]));
  }
  if (tab === 'overview' && extra.delays) {
    add('지연 케이스', ['지연 유형', '경과일', '멘티', '기업(팀)', '그룹', '상태', '멘토', '이행 회차', '필수 회차'], extra.delays.map((d) => [DELAY_LABELS[d.kind], d.days, d.ownerName, d.businessName, d.groupName ?? '', CASE_STATUS_META[d.status as keyof typeof CASE_STATUS_META]?.short ?? d.status, d.mentorName ?? '', d.roundsDone, d.requiredRounds]));
  }
  if (tab === 'overview' && extra.budget) {
    const bRow = (r: BudgetOverview['total']) => [r.name, r.budget ?? '', r.confirmed, r.forecast, r.confirmed + r.forecast, r.budget ? Math.round(((r.confirmed + r.forecast) / r.budget) * 1000) / 10 : ''];
    add('예산', ['구분', '예산(지급총액)', '확정', '예상', '합계', '집행률(%)'], [bRow(extra.budget.total), ...extra.budget.groups.map(bRow)]);
  }
  if (wb.SheetNames.length === 0) add('빈 시트', ['안내'], [['데이터 없음']]);
  return workbookBuffer(wb);
}
