import { describe, expect, it } from 'vitest';

import { fileExtension, roundReportFileName } from './round-report-name';

describe('roundReportFileName', () => {
  it('관찰의견서 라운드 = 책임멘토 멘토링 보고서 및 관찰 의견서(멘토멘토-멘티멘티)_회차 + 확장자', () => {
    expect(roundReportFileName({ mentorName: '홍길동', menteeName: '김철수', roundNo: 1, mode: 'offline', originalName: '보고서 최종.PDF' })).toBe('책임멘토 멘토링 보고서 및 관찰 의견서(홍길동멘토-김철수멘티)_1회차.pdf');
    expect(roundReportFileName({ mentorName: '홍길동', menteeName: '김철수', roundNo: 3, mode: 'online', originalName: 'a.hwpx' })).toBe('책임멘토 멘토링 보고서 및 관찰 의견서(홍길동멘토-김철수멘티)_3회차.hwpx');
  });
  it('이름 안의 하이픈·금지 문자는 구분자와 섞이지 않게 정리한다', () => {
    expect(roundReportFileName({ mentorName: '이-몽룡', menteeName: '성/춘향', roundNo: 2, mode: 'online', originalName: 'x.docx' })).toBe('책임멘토 멘토링 보고서 및 관찰 의견서(이 몽룡멘토-성 춘향멘티)_2회차.docx');
  });
  it('이름이 없으면 기본값, 확장자가 없으면 붙이지 않는다', () => {
    expect(roundReportFileName({ mentorName: '', menteeName: null, roundNo: 4, mode: 'offline', originalName: 'noext' })).toBe('책임멘토 멘토링 보고서 및 관찰 의견서(멘토멘토-멘티멘티)_4회차');
    expect(fileExtension('.hidden')).toBe('');
  });
});
