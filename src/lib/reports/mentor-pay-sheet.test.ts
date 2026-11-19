import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { buildMentorPaySheet, paidAmount, taxHeader, type MentorBlock, type PayLog } from './mentor-pay-sheet';
import { mentorTax, type TaxRule } from './allowance-model';

const rule: TaxRule = { method: 'other_income', expenseRate: 0.6, taxRate: 0.2, localRate: 0.1, rounding: 'floor_10', minTaxable: 50000 };
const log = (p: Partial<PayLog> & Pick<PayLog, 'case_id' | 'round_no' | 'mentor_id'>): PayLog => ({
  mode: 'online',
  started_at: '2026-10-10T01:00:00Z',
  ended_at: '2026-10-10T02:00:00Z',
  report_registered_at: '2026-10-11T00:00:00Z',
  amount_snapshot: 80000,
  group_session_id: null,
  group_fee_holder: false,
  ...p,
});

describe('멘토별 수당 시트', () => {
  it('세율 머리글', () => {
    expect(taxHeader(rule)).toBe('기타소득세(8.8%)');
    expect(taxHeader({ method: 'none' })).toBe('원천징수');
  });

  it('멘토 이름순 블록 · 멘티 줄 · 회차 칸 · 그룹멘토링 병합 · 세금/실지급', async () => {
    const logs: PayLog[] = [
      log({ case_id: 'c1', round_no: 1, mentor_id: 'm1', mode: 'offline', amount_snapshot: 100000 }),
      log({ case_id: 'c1', round_no: 2, mentor_id: 'm1', report_registered_at: null }), // 예정
      log({ case_id: 'c2', round_no: 1, mentor_id: 'm2', ended_at: '2026-10-10T03:00:00Z', amount_snapshot: 160000, group_session_id: 'g', group_fee_holder: true }),
      log({ case_id: 'c3', round_no: 1, mentor_id: 'm2', ended_at: '2026-10-10T03:00:00Z', amount_snapshot: 0, group_session_id: 'g' }),
      log({ case_id: 'c3', round_no: 2, mentor_id: 'm1' }), // 다른 멘토 진행
    ];
    const byKey = new Map(logs.map((l) => [`${l.case_id}:${l.round_no}`, l]));
    const blocks: MentorBlock[] = [
      { no: 1, mentorId: 'm1', name: '가멘토', rule, rows: [{ caseId: 'c1', mentee: '김하나', slots: [], notes: [] }] },
      { no: 2, mentorId: 'm2', name: '나멘토', rule, rows: [{ caseId: 'c2', mentee: '이둘', slots: [], notes: [] }, { caseId: 'c3', mentee: '박셋', slots: [], notes: [] }] },
    ];
    const gross = (b: MentorBlock) => b.rows.reduce((a, r) => a + [1, 2, 3].reduce((a2, n) => a2 + paidAmount(byKey.get(`${r.caseId}:${n}`), b.mentorId), 0), 0);
    const wb = new ExcelJS.Workbook();
    buildMentorPaySheet(wb, {
      title: '행사 A그룹 멘토링 수당',
      roundCount: 3,
      blocks,
      logByCaseRound: byKey,
      sessionMembers: new Map([['g', ['이둘', '박셋']]]),
      taxOf: (b) => mentorTax(gross(b), rule),
      taxLabel: taxHeader(rule),
      rates: { online: 80000, offline: 100000 },
    });
    const ws = wb.getWorksheet('멘토별 회차 수당')!;
    // 머리글: 순번 성명 1~3회차(시간) 1~3회차(수당) 세금 실지급
    expect([1, 2, 3, 6, 9, 10].map((c) => ws.getCell(3, c).value)).toEqual(['순번', '성명', '1회차(시간)', '1회차(수당)', '기타소득세(8.8%)', '실 지급액']);
    // 가멘토: 1회차 오프라인 1시간 100,000 / 2회차 예정 / 3회차 X
    expect(ws.getCell(4, 2).value).toBe('가멘토');
    expect(ws.getCell(4, 3).value).toBe('김하나\n(오프라인/1시간)');
    expect(ws.getCell(4, 6).value).toBe(100000);
    expect(ws.getCell(4, 4).value).toBe('김하나\n(예정 온라인/1시간)');
    expect(ws.getCell(4, 7).value).toBe('-');
    expect(ws.getCell(4, 5).value).toBe('김하나\n(X)');
    expect(ws.getCell(4, 9).value).toBe(mentorTax(100000, rule)); // 소득금액 40,000 ≤ 50,000 → 0
    // 나멘토: 그룹멘토링 1회차 두 줄 병합, 수당 1회분
    expect(ws.getCell(5, 3).value).toBe('이둘, 박셋\n(온라인/2시간)');
    expect(ws.getCell(6, 3).isMerged).toBe(true);
    expect(ws.getCell(5, 6).value).toBe(160000);
    expect(ws.getCell(6, 4).value).toBe('박셋\n(다른 멘토 진행)');
    expect(ws.getCell(5, 9).value).toBe(mentorTax(160000, rule)); // 64,000 → 12,800 + 1,280 = 14,080
    expect(ws.getCell(5, 9).value).toBe(14080);
    expect((ws.getCell(5, 10).value as { result: number }).result).toBe(160000 - 14080);
    expect(ws.getCell(6, 2).isMerged).toBe(true);
    // 합계 줄
    expect((ws.getCell(7, 6).value as { result: number }).result).toBe(260000);
    expect((ws.getCell(7, 10).value as { result: number }).result).toBe(260000 - 14080);
    // 범례: 미시행 · 온라인/2시간 · 오프라인/1시간
    expect([ws.getCell(4, 12).value, ws.getCell(5, 12).value, ws.getCell(6, 12).value]).toEqual(['미시행', '온라인/2시간', '오프라인/1시간']);
    expect(ws.getCell(5, 13).value).toBe(160000);
    expect(ws.getCell(6, 13).value).toBe(100000);
  });
});

describe('예상 수당(보고서 전 일정) — 2026-11-18', () => {
  it('예상으로 넣는 일정 규칙', async () => {
    const { isExpectedRound } = await import('./allowance-expected');
    const open = { status: 'in_progress', outcome: null, menteeInactive: false, activeMentorId: 'm1' };
    const plan = { mentor_id: 'm1', report_registered_at: null };
    expect(isExpectedRound(plan, open)).toBe(true);
    expect(isExpectedRound({ ...plan, report_registered_at: '2026-11-01' }, open)).toBe(false); // 확정 회차
    expect(isExpectedRound(plan, { ...open, status: 'closure_requested' })).toBe(false); // 검수 단계
    expect(isExpectedRound(plan, { ...open, outcome: 'gave_up' })).toBe(false); // 포기 표시
    expect(isExpectedRound(plan, { ...open, menteeInactive: true })).toBe(false); // 비활성 멘티
    expect(isExpectedRound(plan, { ...open, activeMentorId: 'm2' })).toBe(false); // 지금 담당이 아님
    expect(isExpectedRound(plan, { ...open, status: 'reassignment_pending', activeMentorId: null })).toBe(false);
    expect(isExpectedRound(plan, undefined)).toBe(false);
  });

  it('회차 칸 "(예상)" · 세금·실지급은 확정+예상 합계 · 그중 예상 줄', async () => {
    const { blockAmounts, expectedAmount } = await import('./mentor-pay-sheet');
    const { EXPECTED_FMT, EXPECTED_TOTAL_FMT } = await import('./allowance-expected');
    const logs: PayLog[] = [
      log({ case_id: 'c1', round_no: 1, mentor_id: 'm1', ended_at: '2026-10-10T03:00:00Z', amount_snapshot: 200000 }),
      log({ case_id: 'c1', round_no: 2, mentor_id: 'm1', report_registered_at: null, ended_at: '2026-10-10T03:00:00Z', amount_snapshot: 200000, expected: true }),
      log({ case_id: 'c1', round_no: 3, mentor_id: 'm1', report_registered_at: null }), // 예정이지만 예상 아님
    ];
    const byKey = new Map(logs.map((l) => [`${l.case_id}:${l.round_no}`, l]));
    const blocks: MentorBlock[] = [{ no: 1, mentorId: 'm1', name: '가멘토', rule, rows: [{ caseId: 'c1', mentee: '김하나', slots: [], notes: [] }] }];
    expect(expectedAmount(logs[1], 'm1')).toBe(200000);
    expect(expectedAmount(logs[2], 'm1')).toBe(0);
    expect(blockAmounts(blocks[0]!, byKey, 3)).toEqual({ paid: 200000, expected: 200000 });
    const wb = new ExcelJS.Workbook();
    buildMentorPaySheet(wb, {
      title: 't',
      roundCount: 3,
      blocks,
      logByCaseRound: byKey,
      sessionMembers: new Map(),
      taxOf: (b) => {
        const a = blockAmounts(b, byKey, 3);
        return mentorTax(a.paid + a.expected, rule);
      },
      taxLabel: taxHeader(rule),
      rates: { online: 100000, offline: 100000 },
    });
    const ws = wb.getWorksheet('멘토별 회차 수당')!;
    expect(ws.getCell(4, 4).value).toBe('김하나\n(예상 온라인/2시간)');
    expect(ws.getCell(4, 7).value).toBe(200000);
    expect(ws.getCell(4, 7).numFmt).toBe(EXPECTED_FMT);
    expect(ws.getCell(4, 6).numFmt).not.toBe(EXPECTED_FMT); // 확정 회차는 일반 서식
    expect(ws.getCell(4, 5).value).toBe('김하나\n(예정 온라인/1시간)');
    expect(ws.getCell(4, 8).value).toBe('-');
    const tax = mentorTax(400000, rule); // 160,000 → 32,000 + 3,200
    expect(ws.getCell(4, 9).value).toBe(tax);
    expect(ws.getCell(4, 9).numFmt).toBe(EXPECTED_FMT);
    expect((ws.getCell(4, 10).value as { result: number }).result).toBe(400000 - tax);
    // 합계(5행) — 예상 포함 표시, 그중 예상(6행)
    expect((ws.getCell(5, 10).value as { result: number }).result).toBe(400000 - tax);
    expect(ws.getCell(5, 10).numFmt).toBe(EXPECTED_TOTAL_FMT);
    expect(ws.getCell(6, 1).value).toBe('그중 예상');
    expect(ws.getCell(6, 7).value).toBe(200000);
    expect(ws.getCell(6, 6).value).toBe('-');
    expect(ws.getCell(5, 6).numFmt).not.toBe(EXPECTED_TOTAL_FMT); // 예상 없는 회차 열 합계는 일반 서식
  });
});
