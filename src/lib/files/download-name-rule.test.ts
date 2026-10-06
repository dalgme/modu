import { describe, expect, it } from 'vitest';

import { buildDownloadName, buildMentorFileName, fileExt } from './download-name-rule';

describe('buildDownloadName', () => {
  const base = { menteeName: '남준현', mentorName: '강석우' };
  it('멘토링 산출물 = 멘토명-멘티명-구분명', () => {
    expect(buildDownloadName({ ...base, docKey: 'mentoring_report:x', sourceName: 'report.HWP', roundNo: 2 })).toBe('책임멘토 멘토링 보고서 및 결과보고서(강석우 멘토-남준현 멘티)_2회차.hwp');
    expect(buildDownloadName({ ...base, docKey: 'observation_report', sourceName: 'a.pdf' })).toBe('강석우-남준현-관찰의견서.pdf');
    expect(buildDownloadName({ ...base, docKey: 'settlement_statement:abc', sourceName: 's.pdf' })).toBe('강석우-남준현-정산서.pdf');
    expect(buildDownloadName({ ...base, docKey: 'mentoring_photo:x', sourceName: 'IMG_1.JPG', roundNo: 1, seq: 3 })).toBe('강석우-남준현-1회차 사진 3.jpg');
  });
  it('멘티 서류 = 멘티명-구분명 (멘토 이름은 넣지 않음)', () => {
    expect(buildDownloadName({ ...base, docKey: 'business_plan', sourceName: '2분과-51_사업계획서_남준현.hwp' })).toBe('남준현-사업계획서.hwp');
    expect(buildDownloadName({ ...base, docKey: 'business_ref', sourceName: 'ref.pdf', seq: 2 })).toBe('남준현-참고자료 2.pdf');
    expect(buildDownloadName({ ...base, docKey: 'req1:bizreg', sourceName: 'x.pdf', label: '사업자등록증' })).toBe('남준현-사업자등록증.pdf');
  });
  it('멘토가 아직 없으면 멘티명-구분명', () => {
    expect(buildDownloadName({ menteeName: '남준현', mentorName: null, docKey: 'observation_report', sourceName: 'a.hwpx' })).toBe('남준현-관찰의견서.hwpx');
  });
  it('파일 이름에 쓸 수 없는 문자는 정리', () => {
    expect(buildDownloadName({ menteeName: '홍/길:동', mentorName: null, docKey: 'business_plan', sourceName: 'a.pdf' })).toBe('홍 길 동-사업계획서.pdf');
  });
});

describe('buildMentorFileName · fileExt', () => {
  it('멘토 본인 서류 = 멘토명-구분명', () => {
    expect(buildMentorFileName('강석우', '지급서류', 'merged.pdf')).toBe('강석우-지급서류.pdf');
    expect(buildMentorFileName('강석우', '지급서류', 'bank.PNG', 2)).toBe('강석우-지급서류 2.png');
  });
  it('확장자가 없거나 이상하면 빈 문자열', () => {
    expect(fileExt('noext')).toBe('');
    expect(fileExt('a.toolongext')).toBe('');
  });
});
