import type ExcelJS from 'exceljs';

/** exceljs 서식 공용 조각 (2026-10-27) — 수당 산출내역·멘티별 현황 엑셀이 같은 색·글꼴·숫자 서식을 쓴다. */
type Fill = ExcelJS.Fill;
export const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
export const FONT = '맑은 고딕';
export const C = {
  head: 'FF1F3864', head2: 'FFD9E1F2', input: 'FFFFF2CC', band: 'FFF7F9FC',
  on: 'FFDDEBF7', off: 'FFFCE4D6', plan: 'FFE2EFDA', none: 'FFF2F2F2', other: 'FFEDE7F6',
};
export const MONEY = '#,##0;-#,##0;"-"';
export const CNT = '0;-0;"-"';
export const HOURS = '0.#"시간";-0.#;"-"';
export const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
export const medium = { style: 'medium' as const, color: { argb: 'FF595959' } };
export const BOX: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };

export function head(cell: ExcelJS.Cell, text: string, light = false) {
  cell.value = text;
  cell.font = { name: FONT, bold: true, size: 10, color: { argb: light ? C.head : 'FFFFFFFF' } };
  cell.fill = solid(light ? C.head2 : C.head);
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = BOX;
}
export const font = (o: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, ...o });
export const fx = (formula: string, result: number | string) => ({ formula, result });
export const col = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};
