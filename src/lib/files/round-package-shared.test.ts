import { describe, expect, it } from 'vitest';

import { chunkRanges, cleanName, compareExternalNo, dedupeNames, mentorChunkZipName, menteeFolderName, originalPartName, pairPdfName, partKindOf, paymentPdfName } from './round-package-shared';

describe('round-package names', () => {
  it('합본·지급서류 이름 = 요청 형식 그대로', () => {
    expect(pairPdfName('강석우', '남준현', true)).toBe('책임멘토 멘토링 보고서 및 관찰 의견서(강석우멘토-남준현멘티).pdf');
    expect(pairPdfName('송한경', '김예슬', false)).toBe('책임멘토 멘토링 보고서(송한경멘토-김예슬멘티).pdf');
    expect(paymentPdfName('강석우')).toBe('1.수당지급서류 일체_강석우.pdf');
  });

  it('멘토 20명 묶음 — 마지막은 실제 인원까지', () => {
    expect(chunkRanges(53)).toEqual([{ start: 1, end: 20 }, { start: 21, end: 40 }, { start: 41, end: 53 }]);
    expect(chunkRanges(20)).toEqual([{ start: 1, end: 20 }]);
    expect(chunkRanges(0)).toEqual([]);
    expect(mentorChunkZipName(1, 20)).toBe('(붙임2)멘토링 보고서 및 관찰의견서(1~20번).zip');
  });

  it('멘티 폴더 번호 001. — 1000명 이상이면 자릿수 증가', () => {
    expect(menteeFolderName(1, 400, '남준현')).toBe('001. 남준현');
    expect(menteeFolderName(12, 1200, '김/예슬')).toBe('0012. 김 예슬');
  });

  it('동명이인 폴더·이름 정리·정렬', () => {
    expect(dedupeNames(['김민수', '이영희', '김민수', '김민수'])).toEqual(['김민수', '이영희', '김민수(2)', '김민수(3)']);
    expect(cleanName(' a:b*c. ', 'x')).toBe('a b c');
    expect(cleanName('', '멘티')).toBe('멘티');
    expect(['A-10', '', 'A-2', 'A-1'].sort(compareExternalNo)).toEqual(['A-1', 'A-2', 'A-10', '']);
  });

  it('형식 판정·원본 이름', () => {
    expect(partKindOf('보고서.PDF')).toBe('pdf');
    expect(partKindOf('사진.jpeg')).toBe('jpg');
    expect(partKindOf('보고서.hwp')).toBe('other');
    expect(partKindOf('x', 'application/pdf')).toBe('pdf');
    expect(originalPartName('책임멘토 멘토링 보고서(강석우멘토-남준현멘티).pdf', '2회차 보고서', '원본.HWP')).toBe('책임멘토 멘토링 보고서(강석우멘토-남준현멘티) - 2회차 보고서.hwp');
  });
});
