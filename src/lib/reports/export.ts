import 'server-only';

import * as XLSX from 'xlsx';

import type { ProgramMetrics } from '@/lib/reports/metrics';
import type { CaseListItem } from '@/lib/data/cases';
import type { SettlementItem } from '@/lib/data/settlements';
import { CASE_STATUSES, CASE_STATUS_META } from '@/types/case-status';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';

/** 리포트 엑셀 — 탭별 시트 (수치는 metrics 한 곳에서) */
export function buildReportWorkbook(tab: string, m: ProgramMetrics, cases: CaseListItem[], settlements: SettlementItem[], programName: string): Buffer {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));

  if (tab === 'overview' || tab === 'backlog') {
    const p = m.performance;
    const b = m.backlog;
    const s = m.settlement;
    add('개요', [
      [`${programName} 리포트`, m.scope.generatedAt],
      [],
      ['수행 성과'],
      ['케이스', p.cases], ['이행 회차', p.roundsDone], ['계획 회차', p.roundsPlanned], ['완료 회차(정산 확정)', p.roundsCompleted], ['종결', p.closed], ['종결률', p.closureRate], ['온라인 회차', p.onlineRounds], ['오프라인 회차', p.offlineRounds],
      [],
      ['잔여 과업'],
      ['미배정', b.unassigned], ['잔여 회차', b.remainingRounds], [`정체(${b.stalledDays}일)`, b.stalled], ['검수 대기', b.reviewPending], ['보완 요청 중', b.revisionRequested], ['재배정 대기', b.reassignmentPending], ['미서명 회차', b.unsignedRounds], ['미응답 설문', b.unansweredSurveys], ['지급서류 미비 멘토', b.mentorsMissingDocs], ['미처리 요청', b.pendingRequests],
      [],
      ['정산'],
      ['예상(세전)', s.estimatedGross], ['지급 대기', s.pendingNet], ['품의 편성', s.batchedNet], ['정산 확인', s.confirmedNet], ['지급 완료', s.paidNet], ['원천징수 합계', s.withholdingTotal],
    ]);
  }
  if (tab === 'overview' || tab === 'cases' || tab === 'backlog') {
    add('진행현황 매트릭스', [['그룹', ...CASE_STATUSES.map((st) => CASE_STATUS_META[st].short), '합계', '이행 회차', '계획 회차'], ...m.groups.map((g) => [g.name, ...CASE_STATUSES.map((st) => g.byStatus[st]), g.cases, g.roundsDone, g.roundsPlanned])]);
    add('케이스', [
      ['기업(팀)', '멘티', '그룹', '상태', '멘토', '이행 회차', '계획 회차', '등록일'],
      ...cases.filter((c) => tab !== 'backlog' || (!['closed', 'withdrawn'].includes(c.status) && c.roundsDone < c.requiredRounds)).map((c) => [c.business_name, c.owner_name, c.supportTypeName ?? '', CASE_STATUS_META[c.status].short, c.mentorName ?? '', c.roundsDone, c.requiredRounds, c.created_at.slice(0, 10)]),
    ]);
  }
  if (tab === 'overview' || tab === 'mentors') {
    add('멘토 실적', [['멘토', '담당', '활성', '이행 회차', '완료 회차', '온라인', '오프라인', '종결', '확정 실지급', '만족도', '운영사 평가'], ...m.mentors.map((x) => [x.name, x.cases, x.activeCases, x.roundsDone, x.roundsCompleted, x.online, x.offline, x.closed, x.settledNet, x.surveyAvg ?? '', x.reviewAvg ?? ''])]);
  }
  if (tab === 'overview' || tab === 'groups') {
    add('그룹 실적', [['코드', '그룹', '상태', '케이스', '이행 회차', '계획 회차', '종결', '승계 유입', '승계 유출', '만족도', '확정 실지급'], ...m.groups.map((g) => [g.code, g.name, g.status, g.cases, g.roundsDone, g.roundsPlanned, g.closed, g.succeededFrom, g.succeededTo, g.surveyAvg ?? '', g.settledNet])]);
  }
  if (tab === 'overview' || tab === 'settlement') {
    add('정산 건', [
      ['멘토', '기업(팀)', '그룹', '구분', '원천징수 방식', '회차', '지급총액', '소득금액', '소득세', '지방소득세', '원천징수', '실지급', '상태', '품의', '확정일'],
      ...settlements.map((s) => [s.mentorName, s.businessName, s.supportTypeName ?? '', s.kind, WITHHOLDING_LABELS[s.withholding_method as keyof typeof WITHHOLDING_LABELS] ?? s.withholding_method, s.roundCount, Number(s.gross), Number(s.taxable), Number(s.income_tax), Number(s.local_tax), Number(s.withholding), Number(s.net), s.status, s.batchTitle ?? '', (s.confirmed_at ?? '').slice(0, 10)]),
    ]);
    add('방식별 소계', [['방식', '건수', '실지급'], ...m.settlement.byMethod.map((x) => [WITHHOLDING_LABELS[x.method as keyof typeof WITHHOLDING_LABELS] ?? x.method, x.count, x.net]), ['원천징수 합계', '', m.settlement.withholdingTotal]]);
  }
  if (tab === 'overview' || tab === 'survey') {
    add('만족도(그룹)', [['그룹', '평균', '응답 수'], ...m.evaluation.surveyByGroup.map((r) => [r.name, r.avg ?? '', r.n])]);
    add('만족도(멘토)', [['멘토', '평균', '응답 수'], ...m.evaluation.surveyByMentor.map((r) => [r.name, r.avg ?? '', r.n])]);
  }
  if (wb.SheetNames.length === 0) add('빈 시트', [['데이터 없음']]);
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}
