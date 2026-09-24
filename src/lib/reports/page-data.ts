import 'server-only';

import { computeProgramMetrics, type ReportPeriod } from '@/lib/reports/metrics';
import { listCases, type CaseListItem } from '@/lib/data/cases';
import { CASE_STATUSES, CASE_STEP_ORDER, type CaseStatus } from '@/types/case-status';
import { listSettlements } from '@/lib/data/settlements';

/** 리포트 페이지·엑셀이 같은 데이터를 쓴다. period = 기간 필터(회차 보고서 등록일·정산 확정일·케이스 등록/종결일, P30) */
export async function loadReportData(programId: string, supportTypeId?: string | null, period?: ReportPeriod | null) {
  const [m, cases, settlements] = await Promise.all([
    computeProgramMetrics(programId, supportTypeId, period),
    listCases({ programId, supportTypeId: supportTypeId ?? undefined }),
    listSettlements({ programId, supportTypeId: supportTypeId ?? undefined }),
  ]);
  return { m, cases, settlements };
}

/** 기간 칩 (KST) — 전체 | 올해 | 이번 분기 | 이번 달. 리포트 페이지·엑셀 라우트가 같은 계산을 쓴다 (P30) */
export function periodPresets(now = new Date()): { key: string; label: string; from: string | null; to: string | null }[] {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  const q = Math.floor(m / 3) * 3;
  return [
    { key: 'all', label: '전체', from: null, to: null },
    { key: 'year', label: '올해', from: `${y}-01-01`, to: `${y}-12-31` },
    { key: 'quarter', label: '이번 분기', from: `${y}-${pad(q + 1)}-01`, to: `${y}-${pad(q + 3)}-${pad(last(y, q + 2))}` },
    { key: 'month', label: '이번 달', from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last(y, m))}` },
  ];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** `?from&to` 파싱 — 형식이 맞는 값만, from > to 면 맞바꿈 */
export function parsePeriod(sp: { from?: string; to?: string }): ReportPeriod | null {
  const from = sp.from && DATE_RE.test(sp.from) ? sp.from : null;
  const to = sp.to && DATE_RE.test(sp.to) ? sp.to : null;
  if (!from && !to) return null;
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

export interface CaseListParams {
  status?: string;
  mentor?: string;
  q?: string;
  sort?: string;
}

/** 진행현황 표 필터·정렬 (URL 파라미터, P30) — 리포트 페이지(운영사·발주처)와 엑셀이 같은 함수를 쓴다 */
export function filterAndSortCases(cases: CaseListItem[], p: CaseListParams): CaseListItem[] {
  let out = cases;
  if (p.status && (CASE_STATUSES as readonly string[]).includes(p.status)) out = out.filter((c) => c.status === (p.status as CaseStatus));
  if (p.mentor) out = out.filter((c) => c.mentorId === p.mentor);
  const q = (p.q ?? '').trim().toLowerCase();
  if (q) {
    const digits = q.replace(/\D/g, '');
    out = out.filter((c) => c.owner_name.toLowerCase().includes(q) || c.business_name.toLowerCase().includes(q) || (digits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(digits)) || (c.mentorName ?? '').toLowerCase().includes(q));
  }
  const stepIdx = new Map((CASE_STEP_ORDER as readonly CaseStatus[]).map((s, i) => [s, i]));
  const sorted = [...out];
  switch (p.sort) {
    case 'name':
      sorted.sort((a, b) => a.owner_name.localeCompare(b.owner_name, 'ko'));
      break;
    case 'status':
      sorted.sort((a, b) => (stepIdx.get(a.status) ?? 99) - (stepIdx.get(b.status) ?? 99) || a.owner_name.localeCompare(b.owner_name, 'ko'));
      break;
    case 'rounds':
      sorted.sort((a, b) => a.roundsDone - b.roundsDone || a.owner_name.localeCompare(b.owner_name, 'ko'));
      break;
    default:
      break; // recent = listCases 기본(등록 최신순)
  }
  return sorted;
}
