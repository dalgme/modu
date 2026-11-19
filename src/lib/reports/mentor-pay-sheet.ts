import ExcelJS from 'exceljs';

import { kstToday } from '@/lib/excel/sheet';
import { C, MONEY, col, font, fx, head, solid } from '@/lib/excel/styled';
import type { AllowanceRates, AllowanceSlot, TaxRule } from '@/lib/reports/allowance-model';
import { EXPECTED_FMT, EXPECTED_TOTAL_FMT } from '@/lib/reports/allowance-expected';

/**
 * 멘토링 수당 산출내역의 첫 시트 "멘토별 수당" (2026-11-16) — 창경이 1기 1R 에 손으로 만든 수당표와 같은 모양.
 * 서버 전용 데이터 조회와 분리해 두어 테스트에서 바로 그릴 수 있다(allowance-workbook.ts 가 데이터를 넣어 호출).
 */

export interface MentorBlock {
  no: number;
  mentorId: string;
  name: string;
  rule: TaxRule;
  rows: { caseId: string; mentee: string; slots: AllowanceSlot[]; notes: string[] }[];
}

/* ─────────────────────────────── 멘토별 수당 시트 (2026-11-16) ─────────────────────────────── */

export type PayLog = {
  case_id: string;
  round_no: number;
  mentor_id: string;
  mode: string;
  started_at: string;
  ended_at: string;
  report_registered_at: string | null;
  amount_snapshot: number;
  group_session_id: string | null;
  group_fee_holder: boolean;
  /** 보고서 전이지만 예상 수당으로 넣는 일정(allowance-expected.ts isExpectedRound) — 2026-11-18 */
  expected?: boolean;
};

/** 이 멘토에게 지급되는 그 회차 금액 — 보고서 등록 + 본인 진행 회차의 금액 스냅샷(그룹멘토링 비대표 회차는 0원) */
export function paidAmount(l: PayLog | undefined, mentorId: string): number {
  if (!l || l.mentor_id !== mentorId || !l.report_registered_at) return 0;
  return Number(l.amount_snapshot) || 0;
}

/** 예상 수당 — 보고서 전 일정 중 예상으로 넣는 회차의 금액 스냅샷(2026-11-18) */
export function expectedAmount(l: PayLog | undefined, mentorId: string): number {
  if (!l || !l.expected || l.mentor_id !== mentorId || l.report_registered_at) return 0;
  return Number(l.amount_snapshot) || 0;
}

/** 확정 + 예상 */
export function blockAmounts(b: Pick<MentorBlock, 'mentorId' | 'rows'>, logByCaseRound: Map<string, PayLog>, roundCount: number): { paid: number; expected: number } {
  let paid = 0;
  let expected = 0;
  for (const row of b.rows)
    for (let n = 1; n <= roundCount; n++) {
      const l = logByCaseRound.get(`${row.caseId}:${n}`);
      paid += paidAmount(l, b.mentorId);
      expected += expectedAmount(l, b.mentorId);
    }
  return { paid, expected };
}

export function taxHeader(rule: TaxRule): string {
  if (rule.method === 'other_income') {
    const pct = Math.round((1 - rule.expenseRate) * rule.taxRate * (1 + rule.localRate) * 1000) / 10;
    return `기타소득세(${pct}%)`;
  }
  if (rule.method === 'business_income') {
    const pct = Math.round(rule.taxRate * (1 + rule.localRate) * 1000) / 10;
    return `사업소득세(${pct}%)`;
  }
  return '원천징수';
}

const hoursOf = (l: PayLog) => Math.round(((new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 3600000) * 100) / 100;
const hoursText = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)}시간`;
const PAY = { on: 'FFD9F2E4', off: 'FFE4DFEC', plan: 'FFFFF8E1', other: 'FFF2F2F2' };

/**
 * 창경 "멘토링 수당" 표 서식 — 멘토 이름순, 멘토 한 칸(세로 병합) 안에 담당 멘티 줄.
 * 회차(시간) 칸 = "멘티명\n(온라인/2시간)" · 회차(수당) 칸 = 그 회차 금액(보고서 등록 회차만, 금액 스냅샷),
 * 기타소득세·실지급액 = 멘토 합계 기준(세로 병합). 그룹멘토링은 같은 회차·이웃한 줄이면 칸을 합쳐 "멘티A, 멘티B" 로 적는다.
 */
export function buildMentorPaySheet(
  wb: ExcelJS.Workbook,
  o: {
    title: string;
    roundCount: number;
    blocks: MentorBlock[];
    logByCaseRound: Map<string, PayLog>;
    sessionMembers: Map<string, string[]>;
    taxOf: (b: MentorBlock) => number;
    taxLabel: string;
    rates: AllowanceRates;
  },
) {
  const ws = wb.addWorksheet('멘토별 회차 수당', { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:3' } });
  const R = o.roundCount;
  const TIME = (n: number) => 3 + n; // n = 0-based
  const FEE = (n: number) => 3 + R + n;
  const TAX = 3 + 2 * R;
  const NET = TAX + 1;
  const LEG = NET + 2; // 범례 시작 열

  ws.mergeCells(1, 1, 1, NET);
  const t = ws.getCell(1, 1);
  t.value = o.title;
  t.font = font({ bold: true, size: 16 });
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 30;
  ws.getCell(2, 1).value = `생성일 ${kstToday()} · 수당 = 보고서까지 등록된 회차(회차 금액) + 아직 진행 중인 멘티의 등록된 일정은 "(예상)" · (X) = 미시행 · 기타소득세·실지급액은 멘토별 합계 기준`;
  ws.getCell(2, 1).font = font({ size: 9, color: { argb: 'FF595959' } });
  ws.mergeCells(2, 1, 2, NET);

  const heads: [number, string][] = [[1, '순번'], [2, '성명'], [TAX, o.taxLabel], [NET, '실 지급액']];
  for (let n = 0; n < R; n++) heads.push([TIME(n), `${n + 1}회차(시간)`], [FEE(n), `${n + 1}회차(수당)`]);
  for (const [c, text] of heads) head(ws.getCell(3, c), text);
  ws.getRow(3).height = 24;

  const black = { style: 'thin' as const, color: { argb: 'FF000000' } };
  const thick = { style: 'medium' as const, color: { argb: 'FF000000' } };
  let r = 4;
  const feeTotals = Array.from({ length: R }, () => 0);
  const expTotals = Array.from({ length: R }, () => 0);
  /** 예상 금액 칸 — 서식(…(예상))을 일반 서식 적용 뒤에 덮어쓴다 */
  const expectedCells: [number, number][] = [];
  let anyExpected = false;
  let taxTotal = 0;
  let netTotal = 0;
  for (const b of o.blocks) {
    const s = r;
    const rowsN = Math.max(b.rows.length, 1);
    const e = s + rowsN - 1;
    let gross = 0;
    let blockExpected = 0;
    b.rows.forEach((row, i) => {
      const rr = s + i;
      for (let n = 0; n < R; n++) {
        const l = o.logByCaseRound.get(`${row.caseId}:${n + 1}`);
        const tc = ws.getCell(rr, TIME(n));
        const fc = ws.getCell(rr, FEE(n));
        let text = `${row.mentee}\n(X)`;
        let fill: string | null = null;
        let amount: number | null = null;
        let expected = false;
        if (l && l.mentor_id !== b.mentorId) {
          text = `${row.mentee}\n(다른 멘토 진행)`;
          fill = PAY.other;
        } else if (l && !l.report_registered_at && l.expected) {
          text = `${row.mentee}\n(예상 ${l.mode === 'online' ? '온라인' : '오프라인'}/${hoursText(hoursOf(l))})`;
          fill = PAY.plan;
          amount = expectedAmount(l, b.mentorId);
          expected = true;
        } else if (l && !l.report_registered_at) {
          text = `${row.mentee}\n(예정 ${l.mode === 'online' ? '온라인' : '오프라인'}/${hoursText(hoursOf(l))})`;
          fill = PAY.plan;
        } else if (l) {
          const who = l.group_session_id ? (o.sessionMembers.get(l.group_session_id) ?? [row.mentee]).join(', ') : row.mentee;
          text = `${who}\n(${l.mode === 'online' ? '온라인' : '오프라인'}/${hoursText(hoursOf(l))})`;
          fill = l.mode === 'online' ? PAY.on : PAY.off;
          amount = paidAmount(l, b.mentorId);
        }
        tc.value = text;
        if (fill) tc.fill = solid(fill);
        fc.value = amount === null ? '-' : amount;
        if (amount !== null && fill) fc.fill = solid(fill);
        if (expected) {
          expectedCells.push([rr, FEE(n)]);
          blockExpected += amount ?? 0;
          expTotals[n] = (expTotals[n] ?? 0) + (amount ?? 0);
        }
        gross += amount ?? 0;
        feeTotals[n] = (feeTotals[n] ?? 0) + (amount ?? 0);
      }
    });
    // 그룹멘토링 — 같은 회차·같은 세션이 이웃한 줄이면 시간·수당 칸을 세로로 합친다(수당은 대표 1회분이 위 칸에 오도록 합산)
    for (let n = 0; n < R; n++) {
      let i = 0;
      while (i < b.rows.length) {
        const l = o.logByCaseRound.get(`${b.rows[i]!.caseId}:${n + 1}`);
        let j = i;
        if (l?.group_session_id && l.mentor_id === b.mentorId && l.report_registered_at) {
          while (j + 1 < b.rows.length) {
            const nx = o.logByCaseRound.get(`${b.rows[j + 1]!.caseId}:${n + 1}`);
            if (nx?.group_session_id === l.group_session_id && nx.mentor_id === b.mentorId && nx.report_registered_at) j++;
            else break;
          }
        }
        if (j > i) {
          let sum = 0;
          for (let k = i; k <= j; k++) sum += paidAmount(o.logByCaseRound.get(`${b.rows[k]!.caseId}:${n + 1}`), b.mentorId);
          ws.getCell(s + i, FEE(n)).value = sum;
          ws.mergeCells(s + i, TIME(n), s + j, TIME(n));
          ws.mergeCells(s + i, FEE(n), s + j, FEE(n));
        }
        i = j + 1;
      }
    }
    const tax = o.taxOf(b);
    taxTotal += tax;
    netTotal += gross - tax;
    ws.getCell(s, 1).value = b.no;
    ws.getCell(s, 2).value = b.name;
    ws.getCell(s, TAX).value = tax;
    ws.getCell(s, NET).value = fx(`SUM(${col(FEE(0))}${s}:${col(FEE(R - 1))}${e})-${col(TAX)}${s}`, gross - tax);
    if (e > s) for (const c of [1, 2, TAX, NET]) ws.mergeCells(s, c, e, c);
    for (let rr = s; rr <= e; rr++) {
      ws.getRow(rr).height = 34;
      for (let c = 1; c <= NET; c++) {
        const cell = ws.getCell(rr, c);
        const isTime = c >= TIME(0) && c < FEE(0);
        cell.font = font(c === 2 || c === NET ? { bold: true, size: 11 } : { size: isTime ? 9.5 : 10 });
        cell.alignment = isTime || c <= 2 ? { horizontal: 'center', vertical: 'middle', wrapText: true } : { horizontal: 'right', vertical: 'middle' };
        if (c >= FEE(0)) cell.numFmt = MONEY;
        if (c <= 2) cell.fill = solid('FFF2F2F2');
        cell.border = { left: c === 1 ? thick : black, right: c === NET ? thick : black, top: rr === s ? thick : black, bottom: rr === e ? thick : black };
      }
    }
    if (blockExpected > 0) {
      anyExpected = true;
      ws.getCell(s, TAX).numFmt = EXPECTED_FMT;
      ws.getCell(s, NET).numFmt = EXPECTED_FMT;
    }
    for (const [er, ec] of expectedCells.splice(0)) ws.getCell(er, ec).numFmt = EXPECTED_FMT;
    r = e + 1;
  }
  // 합계
  const T = r;
  ws.getCell(T, 1).value = '합계';
  ws.mergeCells(T, 1, T, 2);
  for (let n = 0; n < R; n++) ws.getCell(T, FEE(n)).value = fx(`SUM(${col(FEE(n))}4:${col(FEE(n))}${Math.max(T - 1, 4)})`, feeTotals[n] ?? 0);
  ws.getCell(T, TAX).value = fx(`SUM(${col(TAX)}4:${col(TAX)}${Math.max(T - 1, 4)})`, taxTotal);
  ws.getCell(T, NET).value = fx(`SUM(${col(NET)}4:${col(NET)}${Math.max(T - 1, 4)})`, netTotal);
  for (let c = 1; c <= NET; c++) {
    const cell = ws.getCell(T, c);
    cell.font = font({ bold: true, size: 11 });
    cell.fill = solid(C.head2);
    cell.border = { left: c === 1 ? thick : black, right: c === NET ? thick : black, top: thick, bottom: thick };
    cell.alignment = c <= 2 ? { horizontal: 'center', vertical: 'middle' } : { horizontal: 'right', vertical: 'middle' };
    if (c >= FEE(0)) cell.numFmt = MONEY;
  }
  ws.getRow(T).height = 24;
  if (anyExpected) {
    // 예상 금액이 든 회차 열·세금·실지급 합계만 "(예상 포함)"
    for (let n = 0; n < R; n++) if ((expTotals[n] ?? 0) > 0) ws.getCell(T, FEE(n)).numFmt = EXPECTED_TOTAL_FMT;
    ws.getCell(T, TAX).numFmt = EXPECTED_TOTAL_FMT;
    ws.getCell(T, NET).numFmt = EXPECTED_TOTAL_FMT;
    // 그중 예상 — 회차별 예상 금액 합계(확정 금액과 구분해 보이게)
    const E = T + 1;
    ws.getCell(E, 1).value = '그중 예상';
    ws.mergeCells(E, 1, E, 2);
    for (let n = 0; n < R; n++) ws.getCell(E, FEE(n)).value = (expTotals[n] ?? 0) > 0 ? expTotals[n]! : '-';
    for (let c = 1; c <= NET; c++) {
      const cell = ws.getCell(E, c);
      cell.font = font({ size: 10, color: { argb: 'FF7F6000' } });
      cell.fill = solid(PAY.plan);
      cell.border = { left: c === 1 ? thick : black, right: c === NET ? thick : black, top: black, bottom: thick };
      cell.alignment = c <= 2 ? { horizontal: 'center', vertical: 'middle' } : { horizontal: 'right', vertical: 'middle' };
      if (c >= FEE(0)) cell.numFmt = EXPECTED_FMT;
    }
    ws.getRow(E).height = 20;
  }

  // 오른쪽 범례 — 시간별 수당(시간당 단가 × 시간)
  head(ws.getCell(3, LEG), '시간');
  head(ws.getCell(3, LEG + 1), '수당');
  const combos = new Map<string, { mode: string; h: number; fee: number }>();
  for (const b of o.blocks) for (const row of b.rows) for (let n = 0; n < R; n++) {
    const l = o.logByCaseRound.get(`${row.caseId}:${n + 1}`);
    if (!l || l.mentor_id !== b.mentorId || !(l.report_registered_at || l.expected) || (l.group_session_id && !l.group_fee_holder)) continue;
    const mode = l.mode === 'online' ? '온라인' : '오프라인';
    const h = hoursOf(l);
    const k = `${mode}/${h}`;
    if (!combos.has(k)) combos.set(k, { mode, h, fee: Math.round(h * (l.mode === 'online' ? o.rates.online : o.rates.offline)) });
  }
  const legend = [
    { label: '미시행', fee: null as number | null, fill: null as string | null },
    ...(anyExpected ? [{ label: '예상(보고서 전)', fee: null as number | null, fill: PAY.plan as string | null }] : []),
    ...Array.from(combos.values())
    .sort((a, b2) => (a.mode === b2.mode ? a.h - b2.h : a.mode === '온라인' ? -1 : 1))
    .map((c2) => ({ label: `${c2.mode}/${hoursText(c2.h)}`, fee: c2.fee as number | null, fill: (c2.mode === '온라인' ? PAY.on : PAY.off) as string | null }))];
  legend.forEach((g, i) => {
    const rr = 4 + i;
    const a = ws.getCell(rr, LEG);
    const v = ws.getCell(rr, LEG + 1);
    a.value = g.label;
    v.value = g.fee === null ? '-' : g.fee;
    v.numFmt = MONEY;
    for (const cell of [a, v]) {
      cell.font = font();
      cell.border = { top: black, left: black, bottom: black, right: black };
      if (g.fill) cell.fill = solid(g.fill);
    }
    a.alignment = { horizontal: 'left', vertical: 'middle' };
    v.alignment = { horizontal: 'right', vertical: 'middle' };
  });
  ws.getCell(4 + legend.length, LEG).value = `시간당 단가: 온라인 ${o.rates.online.toLocaleString('ko-KR')}원 · 오프라인 ${o.rates.offline.toLocaleString('ko-KR')}원 (이 라운드에 가장 많이 쓰인 단가)`;
  ws.getCell(4 + legend.length, LEG).font = font({ size: 9, color: { argb: 'FF595959' } });

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 9;
  for (let n = 0; n < R; n++) {
    ws.getColumn(TIME(n)).width = 15;
    ws.getColumn(FEE(n)).width = anyExpected ? 20 : 11;
  }
  ws.getColumn(TAX).width = anyExpected ? 21 : 13;
  ws.getColumn(NET).width = anyExpected ? 21 : 13;
  ws.getColumn(NET + 1).width = 3;
  ws.getColumn(LEG).width = 16;
  ws.getColumn(LEG + 1).width = 12;
}
