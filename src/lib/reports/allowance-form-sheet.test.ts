import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { buildAllowanceFormSheet, rateLegend, roundShortName } from './allowance-form-sheet';

const v = (c: ExcelJS.Cell) => {
  const x = c.value as unknown;
  return x && typeof x === 'object' && 'result' in (x as object) ? (x as { result: unknown }).result : x;
};

describe('멘토링 수당 양식', () => {
  it('라운드 짧은 이름', () => {
    expect(roundShortName('A그룹 · 1기 2라운드')).toBe('1기 2R');
    expect(roundShortName('B그룹 · 2기 1라운드')).toBe('2기 1R');
    expect(roundShortName('D그룹 · 2기 탈락자')).toBe('2기');
    expect(roundShortName('특별반')).toBe('특별반');
  });

  it('시간·수당 표 — 단가가 같으면 온오프라인, 다르면 나눠서', () => {
    expect(rateLegend({ online: 100000, offline: 100000 }, 2)).toEqual([
      { label: '온오프라인/1시간', fee: 100000 },
      { label: '온오프라인/2시간', fee: 200000 },
      { label: '온오프라인/3시간', fee: 300000 },
    ]);
    const split = rateLegend({ online: 80000, offline: 100000 }, 4);
    expect(split.map((x) => x.label)).toEqual(['온라인/1시간', '온라인/2시간', '온라인/3시간', '온라인/4시간', '오프라인/1시간', '오프라인/2시간', '오프라인/3시간', '오프라인/4시간']);
    expect(split[3]!.fee).toBe(320000);
  });

  it('멘토 1줄 · 실지급 = 수당 − 세금 · 소계 · 총합', () => {
    const wb = new ExcelJS.Workbook();
    const ws = buildAllowanceFormSheet(wb, {
      title: '행사 1기 2R 진출자 멘토링 수당',
      taxLabel: '기타소득세(8.8%)',
      rows: [
        { name: '강석우', gross: 200000, tax: 17600 },
        { name: '이종익', gross: 200000, tax: 17600 },
        { name: '최소', gross: 100000, tax: 0 },
      ],
      rates: { online: 100000, offline: 100000 },
      maxHours: 3,
    });
    expect(ws.name).toBe('멘토링 수당');
    expect(v(ws.getCell('A1'))).toBe('행사 1기 2R 진출자 멘토링 수당');
    expect([1, 2, 3, 4, 5, 6].map((c) => v(ws.getCell(3, c)))).toEqual(['순번', '성명', '주민등록번호', '수당', '기타소득세(8.8%)', '실 지급액']);
    expect([1, 2, 4, 5, 6].map((c) => v(ws.getCell(4, c)))).toEqual([1, '강석우', 200000, 17600, 182400]);
    expect((ws.getCell(4, 6).value as { formula: string }).formula).toBe('D4-E4');
    // 소계(7행)·총합(8행)
    expect(v(ws.getCell(7, 1))).toBe('소계');
    expect(v(ws.getCell(7, 5))).toBe(35200);
    expect(v(ws.getCell(7, 6))).toBe(464800);
    expect(v(ws.getCell(8, 1))).toBe('총합');
    expect(v(ws.getCell(8, 5))).toBe(500000);
    expect(v(ws.getCell('H4'))).toBe('온오프라인/1시간');
    expect(v(ws.getCell('I6'))).toBe(300000);
  });
});
