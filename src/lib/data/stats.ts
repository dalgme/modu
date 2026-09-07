import { CASE_STATUS_META, type CaseStatus } from '@/types/case-status';
import type { CaseListItem } from '@/lib/data/cases';

export interface CaseStats {
  total: number;
  byStatus: { status: CaseStatus; label: string; step: number; count: number }[];
  byType: { name: string; count: number }[];
  pendingApproval: number;
  avgProcessingDays: number | null;
}

/**
 * 백오피스 통계 집계 (순수 함수).
 * 이미 조회한 케이스 목록(listCases 결과)에서 계산하므로 별도 DB 조회가 필요 없다.
 * (대시보드에서 listCases 를 한 번만 읽고 통계·큐·테이블에 재사용)
 */
export function computeCaseStats(items: CaseListItem[]): CaseStats {
  // 단계별 분포
  const statusCount = new Map<CaseStatus, number>();
  for (const c of items) {
    statusCount.set(c.status, (statusCount.get(c.status) ?? 0) + 1);
  }
  const byStatus = (Object.keys(CASE_STATUS_META) as CaseStatus[])
    .map((s) => ({
      status: s,
      label: CASE_STATUS_META[s].label,
      step: CASE_STATUS_META[s].step,
      count: statusCount.get(s) ?? 0,
    }))
    .filter((x) => x.count > 0);

  // 유형별 건수
  const typeCount = new Map<string, number>();
  for (const c of items) {
    const name = c.supportTypeName ?? '기타';
    typeCount.set(name, (typeCount.get(name) ?? 0) + 1);
  }
  const byType = Array.from(typeCount.entries()).map(([name, count]) => ({ name, count }));

  // 승인 대기 (검수완료 + 지급신청 작성완료)
  const pendingApproval = items.filter(
    (c) => c.status === 'reviewed' || c.status === 'payment_application_drafted',
  ).length;

  // 평균 처리일수 (종료 케이스: created → updated)
  const closed = items.filter((c) => c.status === 'payment_approved');
  let avgProcessingDays: number | null = null;
  if (closed.length > 0) {
    const totalDays = closed.reduce((sum, c) => {
      const days =
        (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 86_400_000;
      return sum + days;
    }, 0);
    avgProcessingDays = Math.round((totalDays / closed.length) * 10) / 10;
  }

  return { total: items.length, byStatus, byType, pendingApproval, avgProcessingDays };
}
