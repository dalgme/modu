import 'server-only';

import { computeProgramMetrics } from '@/lib/reports/metrics';
import { listCases } from '@/lib/data/cases';
import { listSettlements } from '@/lib/data/settlements';

/** 리포트 페이지·엑셀이 같은 데이터를 쓴다 */
export async function loadReportData(programId: string, supportTypeId?: string | null) {
  const [m, cases, settlements] = await Promise.all([
    computeProgramMetrics(programId, supportTypeId),
    listCases({ programId, supportTypeId: supportTypeId ?? undefined }),
    listSettlements({ programId, supportTypeId: supportTypeId ?? undefined }),
  ]);
  return { m, cases, settlements };
}
