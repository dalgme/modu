import { describe, expect, it } from 'vitest';

import { fileExtension, roundReportFileName } from './round-report-name';

describe('roundReportFileName', () => {
  it('멘토명-멘티명-회차-방법 + 확장자', () => {
    expect(roundReportFileName({ mentorName: '홍길동', menteeName: '김철수', roundNo: 1, mode: 'offline', originalName: '보고서 최종.PDF' })).toBe('홍길동-김철수-1회차-오프라인.pdf');
    expect(roundReportFileName({ mentorName: '홍길동', menteeName: '김철수', roundNo: 3, mode: 'online', originalName: 'a.hwpx' })).toBe('홍길동-김철수-3회차-온라인.hwpx');
  });
  it('이름 안의 하이픈·금지 문자는 구분자와 섞이지 않게 정리한다', () => {
    expect(roundReportFileName({ mentorName: '이-몽룡', menteeName: '성/춘향', roundNo: 2, mode: 'online', originalName: 'x.docx' })).toBe('이 몽룡-성 춘향-2회차-온라인.docx');
  });
  it('이름이 없으면 기본값, 확장자가 없으면 붙이지 않는다', () => {
    expect(roundReportFileName({ mentorName: '', menteeName: null, roundNo: 4, mode: 'offline', originalName: 'noext' })).toBe('멘토-멘티-4회차-오프라인');
    expect(fileExtension('.hidden')).toBe('');
  });
});
