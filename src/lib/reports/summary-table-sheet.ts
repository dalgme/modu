import type ExcelJS from 'exceljs';

import { font, solid } from '@/lib/excel/styled';

/**
 * 멘토링 총괄표 (2026-11-18) — 사용자 제공 양식: 멘토링 1건(회차) = 1줄.
 *   연번 · 권역 · 운영사 · 진출자명 · 멘토명 · 일자 · 시간 · 방식(대면/비대면) · 주요 내용 · 지급수당(만원)
 * 권역 = 행사 설정 '총괄표 권역', 운영사 = 행사 설정 발주처 기관명(모든 줄 같은 값),
 * 주요 내용 = 보고서의 "멘토링 주제" 칸(브라우저가 읽어 저장한 값, 웹 작성 주제가 있으면 그 값),
 * 지급수당 = 회차 금액 스냅샷 ÷ 10,000 (그룹멘토링 비대표 회차는 0).
 * 서버 조회와 분리 — summary-table-workbook.ts 가 값을 넣어 호출하고, 테스트는 바로 그린다.
 */
export interface SummaryRow {
  region: string;
  operator: string;
  mentee: string;
  mentor: string;
  /** YYYY-MM-DD (KST) */
  date: string;
  hours: number;
  mode: 'online' | 'offline';
  topic: string;
  /** 원 단위 */
  amount: number;
}

export const SUMMARY_HEADERS = ['연번', '권역', '운영사', '진출자명', '멘토명', '일자', '시간', '방식', '주요 내용', '지급수당(만원)'] as const;

export const modeLabel = (m: 'online' | 'offline') => (m === 'offline' ? '대면' : '비대면');
export const toManwon = (won: number) => Math.round((won / 10000) * 100) / 100;

/** 정렬 — 멘토명 → 진출자명 → 일자 */
export function sortSummaryRows<T extends Pick<SummaryRow, 'mentor' | 'mentee' | 'date'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.mentor.localeCompare(b.mentor, 'ko') || a.mentee.localeCompare(b.mentee, 'ko') || a.date.localeCompare(b.date));
}

export function buildSummarySheet(wb: ExcelJS.Workbook, o: { title: string; rows: SummaryRow[] }): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('총괄표', { views: [{ state: 'frozen', ySplit: 3 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:3' } });
  const line = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
  ws.getCell('A1').value = o.title;
  ws.getCell('A1').font = font({ bold: true, size: 18 });
  ws.getRow(1).height = 30;
  ws.getCell('A2').value = '* 건 별 작성';
  ws.getCell('A2').font = font({ bold: true, size: 9, color: { argb: 'FFC00000' } });

  SUMMARY_HEADERS.forEach((h, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = h;
    c.font = font({ size: 11 });
    c.fill = solid('FFD9E1F2');
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: line, bottom: line, left: line, right: line };
  });
  ws.getRow(3).height = 22;

  o.rows.forEach((r, i) => {
    const rr = 4 + i;
    const values: (string | number)[] = [i + 1, r.region, r.operator, r.mentee, r.mentor, r.date, r.hours, modeLabel(r.mode), r.topic, toManwon(r.amount)];
    values.forEach((v, c) => {
      const cell = ws.getCell(rr, c + 1);
      cell.value = v;
      cell.font = font({ size: 11 });
      cell.border = { top: line, bottom: line, left: line, right: line };
      cell.alignment = c === 8 ? { horizontal: 'center', vertical: 'middle', wrapText: true } : c === 9 ? { horizontal: 'right', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
    });
    // 시간·만원은 일반 서식(정수는 "10", 소수는 "0.5") — "0.##" 는 엑셀에서 "10." 처럼 점이 남는다
    ws.getRow(rr).height = r.topic.length > 28 ? 36 : 22;
  });
  const last = Math.max(4, 3 + o.rows.length);
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: last, column: SUMMARY_HEADERS.length } };
  [6, 10, 22, 11, 11, 12, 7, 9, 44, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return ws;
}
