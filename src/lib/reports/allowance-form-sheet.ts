import type ExcelJS from 'exceljs';

import { MONEY, font, fx, solid } from '@/lib/excel/styled';

/**
 * "멘토링 수당" 양식 (2026-11-18) — 사용자 제공 수당 양식 그대로: 멘토 1명 = 1줄.
 *   순번 · 성명 · 주민등록번호(빈칸 — 플랫폼은 주민등록번호를 보관하지 않음) · 수당 · 기타소득세(8.8%) · 실 지급액
 *   → 소계(기타소득세·실 지급액 노란 칸) → 총합(= 소계 기타소득세 + 소계 실 지급액 = 수당 합계)
 *   오른쪽 표 = 시간 · 수당 (단가가 온·오프라인 같으면 "온오프라인/N시간").
 * 수당 = 보고서 등록 회차의 금액 스냅샷 합계(멘토별 회차 수당 시트와 같은 값), 세금 = 멘토 합계 기준(같은 함수).
 * 서버 조회와 분리 — allowance-workbook.ts 가 값을 넣어 호출하고, 테스트는 바로 그린다.
 */
export interface AllowanceFormRow {
  name: string;
  gross: number;
  tax: number;
}

export interface AllowanceFormInput {
  title: string;
  taxLabel: string;
  rows: AllowanceFormRow[];
  rates: { online: number; offline: number };
  /** 실제로 쓰인 최대 운영시간(시간) — 오른쪽 표를 1시간~이 값(최소 3)까지 */
  maxHours: number;
}

/** 라운드(그룹) 이름 → 짧은 표기 "1기 2R" (못 읽으면 그대로) */
export function roundShortName(groupName: string): string {
  const m = /(\d+)\s*기\s*(\d+)\s*(?:라운드|R)/i.exec(groupName);
  if (m) return `${m[1]}기 ${m[2]}R`;
  const k = /(\d+)\s*기/.exec(groupName);
  return k ? `${k[1]}기` : groupName.trim();
}

/** 오른쪽 시간·수당 표 줄 */
export function rateLegend(rates: { online: number; offline: number }, maxHours: number): { label: string; fee: number }[] {
  const top = Math.max(3, Math.ceil(maxHours));
  const out: { label: string; fee: number }[] = [];
  if (rates.online === rates.offline) {
    for (let h = 1; h <= top; h++) out.push({ label: `온오프라인/${h}시간`, fee: h * rates.online });
  } else {
    for (let h = 1; h <= top; h++) out.push({ label: `온라인/${h}시간`, fee: h * rates.online });
    for (let h = 1; h <= top; h++) out.push({ label: `오프라인/${h}시간`, fee: h * rates.offline });
  }
  return out;
}

const NUM = '#,##0';
const GRAY = 'FFD9D9D9';
const YELLOW = 'FFFFFF00';

export function buildAllowanceFormSheet(wb: ExcelJS.Workbook, o: AllowanceFormInput): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('멘토링 수당', { views: [{ state: 'frozen', ySplit: 3 }], pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:3' } });
  const black = { style: 'thin' as const, color: { argb: 'FF000000' } };
  const thick = { style: 'medium' as const, color: { argb: 'FF000000' } };
  const LEG = 8; // H 열부터 시간·수당 표

  ws.getCell(1, 1).value = o.title;
  ws.getCell(1, 1).font = font({ bold: true, size: 18 });
  ws.getRow(1).height = 32;

  const heads = ['순번', '성명', '주민등록번호', '수당', o.taxLabel, '실 지급액'];
  heads.forEach((h, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = h;
    c.font = font({ size: 11 });
    c.fill = solid(GRAY);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.getRow(3).height = 20;

  const first = 4;
  o.rows.forEach((row, i) => {
    const r = first + i;
    ws.getCell(r, 1).value = i + 1;
    ws.getCell(r, 2).value = row.name;
    ws.getCell(r, 3).value = '';
    ws.getCell(r, 4).value = row.gross;
    ws.getCell(r, 5).value = row.tax;
    ws.getCell(r, 6).value = fx(`D${r}-E${r}`, row.gross - row.tax);
    for (let c = 1; c <= 6; c++) {
      const cell = ws.getCell(r, c);
      cell.font = font({ size: 11 });
      cell.alignment = { horizontal: c >= 4 ? 'right' : 'center', vertical: 'middle' };
      if (c >= 4) cell.numFmt = NUM;
    }
    ws.getRow(r).height = 20;
  });
  const last = first + Math.max(o.rows.length, 1) - 1;
  const S = last + 1; // 소계
  const T = S + 1; // 총합
  const taxSum = o.rows.reduce((a, r) => a + r.tax, 0);
  const netSum = o.rows.reduce((a, r) => a + r.gross - r.tax, 0);

  ws.mergeCells(S, 1, S, 4);
  ws.getCell(S, 1).value = '소계';
  ws.getCell(S, 5).value = fx(`SUM(E${first}:E${last})`, taxSum);
  ws.getCell(S, 6).value = fx(`SUM(F${first}:F${last})`, netSum);
  ws.mergeCells(T, 1, T, 4);
  ws.getCell(T, 1).value = '총합';
  ws.mergeCells(T, 5, T, 6);
  ws.getCell(T, 5).value = fx(`E${S}+F${S}`, taxSum + netSum);
  for (const r of [S, T]) {
    for (let c = 1; c <= 6; c++) {
      const cell = ws.getCell(r, c);
      cell.font = font({ size: 11, bold: true });
      if (c <= 4) {
        cell.fill = solid(GRAY);
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.numFmt = MONEY;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    }
    ws.getRow(r).height = 20;
  }
  ws.getCell(S, 5).fill = solid(YELLOW);
  ws.getCell(S, 6).fill = solid(YELLOW);

  // 표 테두리(가는 선 + 바깥 굵은 선)
  for (let r = 3; r <= T; r++) {
    for (let c = 1; c <= 6; c++) {
      ws.getCell(r, c).border = { top: r === 3 ? thick : black, bottom: r === T ? thick : black, left: c === 1 ? thick : black, right: c === 6 ? thick : black };
    }
  }

  // 오른쪽 시간·수당 표
  const legend = rateLegend(o.rates, o.maxHours);
  ['시간', '수당'].forEach((h, i) => {
    const c = ws.getCell(3, LEG + i);
    c.value = h;
    c.font = font({ size: 11 });
    c.fill = solid(GRAY);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = { top: black, bottom: black, left: black, right: black };
  });
  legend.forEach((g, i) => {
    const a = ws.getCell(4 + i, LEG);
    const v = ws.getCell(4 + i, LEG + 1);
    a.value = g.label;
    v.value = g.fee;
    v.numFmt = NUM;
    for (const cell of [a, v]) {
      cell.font = font({ size: 11 });
      cell.border = { top: black, bottom: black, left: black, right: black };
    }
    a.alignment = { horizontal: 'left', vertical: 'middle' };
    v.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  const widths = [7, 12, 16, 13, 17, 13, 5, 18, 12];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.getCell(T + 2, 1).value = '※ 수당 = 보고서까지 등록된 회차의 금액 합계(시간당 단가 × 운영시간). 기타소득세는 멘토별 합계 기준. 주민등록번호는 플랫폼이 보관하지 않아 빈칸입니다.';
  ws.getCell(T + 2, 1).font = font({ size: 9, color: { argb: 'FF595959' } });
  return ws;
}
