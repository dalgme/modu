import 'server-only';

import * as XLSX from 'xlsx';

import type { BatchItem, SettlementItem } from '@/lib/data/settlements';
import { WITHHOLDING_LABELS } from '@/lib/settlement/compute';

/** 지급 품의서 엑셀 — 건별 시트 + 멘토별 합계 시트 (금액은 스냅샷 값 그대로, 재계산 없음) */
export function buildBatchWorkbook(batch: BatchItem, items: SettlementItem[], programName: string): Buffer {
  const header = ['No', '멘토', '멘티(기업·팀)', '대표', '그룹', '구분', '원천징수 방식', '온라인 회차', '오프라인 회차', '지급총액', '소득금액', '소득세', '지방소득세', '원천징수 합계', '실지급액', '확정일'];
  const rows = items.map((s, i) => {
    const online = s.linesParsed.filter((l) => l.mode === 'online').reduce((a, l) => a + l.count, 0);
    const offline = s.linesParsed.filter((l) => l.mode === 'offline').reduce((a, l) => a + l.count, 0);
    return [i + 1, s.mentorName, s.businessName, s.ownerName, s.supportTypeName ?? '', s.kind === 'closure' ? '종결' : '부분', WITHHOLDING_LABELS[s.withholding_method as keyof typeof WITHHOLDING_LABELS] ?? s.withholding_method, online, offline, Number(s.gross), Number(s.taxable), Number(s.income_tax), Number(s.local_tax), Number(s.withholding), Number(s.net), (s.confirmed_at ?? '').slice(0, 10)];
  });
  const total = ['합계', '', '', '', '', '', '', rows.reduce((a, r) => a + (r[7] as number), 0), rows.reduce((a, r) => a + (r[8] as number), 0), Number(batch.total_gross), items.reduce((a, s) => a + Number(s.taxable), 0), items.reduce((a, s) => a + Number(s.income_tax), 0), items.reduce((a, s) => a + Number(s.local_tax), 0), Number(batch.total_withholding), Number(batch.total_net), ''];
  const detail = XLSX.utils.aoa_to_sheet([[`${programName} — ${batch.title}`], [], header, ...rows, total]);

  const byMentor = new Map<string, { name: string; count: number; gross: number; withholding: number; net: number }>();
  for (const s of items) {
    const m = byMentor.get(s.mentor_id) ?? { name: s.mentorName, count: 0, gross: 0, withholding: 0, net: 0 };
    m.count += 1;
    m.gross += Number(s.gross);
    m.withholding += Number(s.withholding);
    m.net += Number(s.net);
    byMentor.set(s.mentor_id, m);
  }
  const summary = XLSX.utils.aoa_to_sheet([
    ['멘토', '정산 건수', '지급총액', '원천징수', '실지급액'],
    ...Array.from(byMentor.values()).map((m) => [m.name, m.count, m.gross, m.withholding, m.net]),
    ['합계', items.length, Number(batch.total_gross), Number(batch.total_withholding), Number(batch.total_net)],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, detail, '건별 내역');
  XLSX.utils.book_append_sheet(wb, summary, '멘토별 합계');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}
