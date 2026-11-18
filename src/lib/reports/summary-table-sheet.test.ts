import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { cleanTopic, textInRect, textRightOf } from '@/lib/files/report-topic-shared';
import { SUMMARY_HEADERS, buildSummarySheet, modeLabel, sortSummaryRows, toManwon, type SummaryRow } from './summary-table-sheet';

describe('멘토링 주제 읽기', () => {
  const boxes = [
    { text: '멘토링 주제', x: 10, y: 100, w: 60, h: 10 },
    { text: '청년농 B2G 계약·유통 플랫폼의', x: 90, y: 95, w: 160, h: 10 },
    { text: '핵심 비즈니스모델 정립', x: 90, y: 108, w: 120, h: 10 },
    { text: '멘토링 결과', x: 10, y: 140, w: 60, h: 10 },
    { text: '다른 칸 내용', x: 90, y: 140, w: 60, h: 10 },
  ];
  it('칸 안 글자를 줄 순서대로 잇는다(칸 밖 글자 제외)', () => {
    expect(textInRect(boxes, { x: 80, y: 90, w: 300, h: 35 })).toBe('청년농 B2G 계약·유통 플랫폼의 핵심 비즈니스모델 정립');
  });
  it('표 선이 없을 때 — 같은 줄 오른쪽', () => {
    expect(textRightOf(boxes, { x: 10, y: 140, w: 60, h: 10 })).toBe('다른 칸 내용');
  });
  it('정리 — 불릿·공백·길이', () => {
    expect(cleanTopic('  • 사업계획서\n  검토 ')).toBe('사업계획서 검토');
    expect(cleanTopic('가'.repeat(400))).toHaveLength(300);
  });
});

describe('멘토링 총괄표', () => {
  const row = (o: Partial<SummaryRow>): SummaryRow => ({ region: '중부권', operator: '발주처', mentee: '남준현', mentor: '강석우', date: '2026-07-09', hours: 1, mode: 'offline', topic: '주제', amount: 100000, ...o });

  it('방식·만원·정렬(멘토 → 멘티 → 일자)', () => {
    expect(modeLabel('offline')).toBe('대면');
    expect(modeLabel('online')).toBe('비대면');
    expect(toManwon(160000)).toBe(16);
    expect(toManwon(0)).toBe(0);
    expect(toManwon(45000)).toBe(4.5);
    const sorted = sortSummaryRows([row({ mentor: '강영준', date: '2026-07-11' }), row({ mentor: '강석우', date: '2026-07-22' }), row({ mentor: '강석우', date: '2026-07-09' })]);
    expect(sorted.map((r) => `${r.mentor}/${r.date}`)).toEqual(['강석우/2026-07-09', '강석우/2026-07-22', '강영준/2026-07-11']);
  });

  it('제목 · 건별 표시 · 머리글 · 1건 1줄', () => {
    const wb = new ExcelJS.Workbook();
    const ws = buildSummarySheet(wb, { title: '2026 행사 멘토링 총괄표', rows: [row({}), row({ mode: 'online', hours: 0.5, amount: 0, topic: '' })] });
    expect(ws.getCell('A1').value).toBe('2026 행사 멘토링 총괄표');
    expect(ws.getCell('A2').value).toBe('* 건 별 작성');
    expect(SUMMARY_HEADERS.map((_, i) => ws.getCell(3, i + 1).value)).toEqual(['연번', '권역', '운영사', '진출자명', '멘토명', '일자', '시간', '방식', '주요 내용', '지급수당(만원)']);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => ws.getCell(4, c).value)).toEqual([1, '중부권', '발주처', '남준현', '강석우', '2026-07-09', 1, '대면', '주제', 10]);
    expect([7, 8, 10].map((c) => ws.getCell(5, c).value)).toEqual([0.5, '비대면', 0]);
  });
});
