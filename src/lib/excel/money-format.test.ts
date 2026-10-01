import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { applyMoneyFormat, isMoneyHeader, MONEY_FORMAT, sheetWithMeta } from './sheet';

describe('엑셀 금액 칸 천단위 콤마 (P49)', () => {
  it('헤더 이름으로 금액 칸을 판정한다', () => {
    for (const h of ['1회차 수당', '1회차 세금분', '1회차 실지급분', '확정 실지급', '지급총액', '원천징수 합계', '소득세', '지방소득세', '총지급(세전)', '단가 스냅샷', '금액 스냅샷', '예산(지급총액)']) expect(isMoneyHeader(h)).toBe(true);
    for (const h of ['1회차 시수', '정산 건수', '원천징수 방식', '집행률(%)', '종결률', '만족도', '지급서류', '이행 회차', '인원', '순위']) expect(isMoneyHeader(h)).toBe(false);
    expect(isMoneyHeader('확정', ['확정'])).toBe(true);
  });

  it('금액 칸 정수에만 서식을 붙이고 값은 숫자 그대로 둔다', () => {
    const ws = sheetWithMeta(['멘토', '이행 회차', '1회차 수당', '만족도'], [['가', 1200, 80000, 4.5], ['나', 3, '', 4]], { extra: [['건수', 2]] });
    const buf = XLSX.write({ SheetNames: ['s'], Sheets: { s: ws } }, { type: 'buffer', bookType: 'xlsx' });
    const back = XLSX.read(buf, { type: 'buffer', cellNF: true }).Sheets.s!;
    const find = (v: unknown) => Object.entries(back).find(([k, c]) => !k.startsWith('!') && (c as XLSX.CellObject).v === v)?.[1] as XLSX.CellObject;
    expect(find(80000).t).toBe('n');
    expect(find(80000).z).toBe(MONEY_FORMAT);
    expect(find(80000).w).toBe('80,000');
    expect(find(1200).z).not.toBe(MONEY_FORMAT);
    expect(find(4.5).z).not.toBe(MONEY_FORMAT);
  });

  it('항목/값 2열 시트는 왼쪽 항목 이름으로 판정한다', () => {
    const ws = applyMoneyFormat(XLSX.utils.aoa_to_sheet([['구분', '항목', '값'], ['정산', '지급 대기', 1500000], ['정산', '원천징수 합계', 132000], ['수행 성과', '케이스', 1500]]), ['지급 대기']);
    expect((ws.C2 as XLSX.CellObject).z).toBe(MONEY_FORMAT);
    expect((ws.C3 as XLSX.CellObject).z).toBe(MONEY_FORMAT);
    expect((ws.C4 as XLSX.CellObject).z).toBeUndefined();
  });
});
