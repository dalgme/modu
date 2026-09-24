import 'server-only';

import * as XLSX from 'xlsx';

import type { BatchItem, SettlementItem } from '@/lib/data/settlements';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';
import { BATCH_STATUS_LABELS, SETTLEMENT_STATUS_LABELS } from '@/lib/settlement/labels';

export const SETTLEMENT_KIND_LABELS: Record<string, string> = { closure: '종결', partial: '부분' };

const kstDay = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10) : '');
const kstMonth = (iso: string | null | undefined) => kstDay(iso).slice(0, 7);
const methodLabel = (m: string) => WITHHOLDING_LABELS[m as keyof typeof WITHHOLDING_LABELS] ?? m;

/**
 * 지급 품의서 엑셀 (금액은 스냅샷 값 그대로, 재계산 없음).
 *  시트: 건별 내역 · 멘토별 합계 · 그룹별 소계 · 멘토×원천징수 (P31: 한글 라벨, 지급일·귀속연월 컬럼, 소계 시트 2종)
 * 귀속연월 = 지급일(paid_at) 기준, 미지급이면 확정일 기준(예정).
 */
export function buildBatchWorkbook(batch: BatchItem, items: SettlementItem[], programName: string): Buffer {
  const header = ['No', '멘토', '멘티(기업·팀)', '대표', '그룹', '구분', '상태', '원천징수 방식', '온라인 회차', '오프라인 회차', '지급총액', '소득금액', '소득세', '지방소득세', '원천징수 합계', '실지급액', '확정일', '지급일', '귀속연월'];
  const rows = items.map((s, i) => {
    const online = s.linesParsed.filter((l) => l.mode === 'online').reduce((a, l) => a + l.count, 0);
    const offline = s.linesParsed.filter((l) => l.mode === 'offline').reduce((a, l) => a + l.count, 0);
    return [
      i + 1,
      s.mentorName,
      s.businessName,
      s.ownerName,
      s.supportTypeName ?? '',
      SETTLEMENT_KIND_LABELS[s.kind] ?? s.kind,
      SETTLEMENT_STATUS_LABELS[s.status] ?? s.status,
      methodLabel(s.withholding_method),
      online,
      offline,
      Number(s.gross),
      Number(s.taxable),
      Number(s.income_tax),
      Number(s.local_tax),
      Number(s.withholding),
      Number(s.net),
      kstDay(s.confirmed_at),
      kstDay(s.paid_at ?? batch.paid_at),
      kstMonth(s.paid_at ?? batch.paid_at) || `${kstMonth(s.confirmed_at)} (예정)`,
    ];
  });
  const total = ['합계', '', '', '', '', '', '', '', rows.reduce((a, r) => a + (r[8] as number), 0), rows.reduce((a, r) => a + (r[9] as number), 0), Number(batch.total_gross), items.reduce((a, s) => a + Number(s.taxable), 0), items.reduce((a, s) => a + Number(s.income_tax), 0), items.reduce((a, s) => a + Number(s.local_tax), 0), Number(batch.total_withholding), Number(batch.total_net), '', '', ''];
  const detail = XLSX.utils.aoa_to_sheet([[`${programName} — ${batch.title}`], [`상태: ${BATCH_STATUS_LABELS[batch.status] ?? batch.status} · 제출 ${kstDay(batch.submitted_at) || '-'} · 정산 확인 ${kstDay(batch.confirmed_at) || '-'} · 지급 ${kstDay(batch.paid_at) || '-'}`], [], header, ...rows, total]);

  type Agg = { count: number; gross: number; taxable: number; income_tax: number; local_tax: number; withholding: number; net: number };
  const agg = (): Agg => ({ count: 0, gross: 0, taxable: 0, income_tax: 0, local_tax: 0, withholding: 0, net: 0 });
  const add = (a: Agg, s: SettlementItem) => {
    a.count += 1;
    a.gross += Number(s.gross);
    a.taxable += Number(s.taxable);
    a.income_tax += Number(s.income_tax);
    a.local_tax += Number(s.local_tax);
    a.withholding += Number(s.withholding);
    a.net += Number(s.net);
  };
  const aggRow = (label: string[], a: Agg) => [...label, a.count, a.gross, a.taxable, a.income_tax, a.local_tax, a.withholding, a.net];
  const aggHeader = ['정산 건수', '지급총액', '소득금액', '소득세', '지방소득세', '원천징수', '실지급액'];
  const grand = agg();
  for (const s of items) add(grand, s);

  const byMentor = new Map<string, { name: string } & Agg>();
  const byGroup = new Map<string, { name: string } & Agg>();
  const byMentorMethod = new Map<string, { name: string; method: string } & Agg>();
  for (const s of items) {
    const m = byMentor.get(s.mentor_id) ?? { name: s.mentorName, ...agg() };
    add(m, s);
    byMentor.set(s.mentor_id, m);
    const gKey = s.supportTypeName ?? '(그룹 없음)';
    const g = byGroup.get(gKey) ?? { name: gKey, ...agg() };
    add(g, s);
    byGroup.set(gKey, g);
    const mmKey = `${s.mentor_id}|${s.withholding_method}`;
    const mm = byMentorMethod.get(mmKey) ?? { name: s.mentorName, method: s.withholding_method, ...agg() };
    add(mm, s);
    byMentorMethod.set(mmKey, mm);
  }
  const sortKo = <T extends { name: string }>(list: T[]) => list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const mentorSheet = XLSX.utils.aoa_to_sheet([['멘토', ...aggHeader], ...sortKo(Array.from(byMentor.values())).map((m) => aggRow([m.name], m)), aggRow(['합계'], grand)]);
  const groupSheet = XLSX.utils.aoa_to_sheet([['그룹', ...aggHeader], ...sortKo(Array.from(byGroup.values())).map((g) => aggRow([g.name], g)), aggRow(['합계'], grand)]);
  const mentorMethodSheet = XLSX.utils.aoa_to_sheet([
    ['멘토', '원천징수 방식', ...aggHeader],
    ...sortKo(Array.from(byMentorMethod.values())).map((x) => aggRow([x.name, methodLabel(x.method)], x)),
    aggRow(['합계', ''], grand),
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, detail, '건별 내역');
  XLSX.utils.book_append_sheet(wb, mentorSheet, '멘토별 합계');
  XLSX.utils.book_append_sheet(wb, groupSheet, '그룹별 소계');
  XLSX.utils.book_append_sheet(wb, mentorMethodSheet, '멘토×원천징수');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}
