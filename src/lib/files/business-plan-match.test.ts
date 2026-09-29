import { describe, expect, it } from 'vitest';

import { businessDocExtAllowed, matchMenteeFile, type MenteeMatchCandidate } from '@/lib/files/business-plan-match';

const C: MenteeMatchCandidate[] = [
  { caseId: 'c1', name: '홍길동', externalNo: 'A-001' },
  { caseId: 'c2', name: '홍길', externalNo: 'A-002' },
  { caseId: 'c3', name: '김민' },
  { caseId: 'c4', name: 'Kim Sora' },
];

const ok = (fileName: string, cands = C) => {
  const r = matchMenteeFile(fileName, cands);
  return r.ok ? r.caseId : r.reason;
};

describe('matchMenteeFile — 파일명 맨 앞 멘티명 귀속', () => {
  it('구분자(_ - 공백 . 괄호)로 이름을 끊는다', () => {
    expect(ok('홍길동_사업계획서.pdf')).toBe('c1');
    expect(ok('홍길동-참고자료.hwp')).toBe('c1');
    expect(ok('홍길동 사업계획서.docx')).toBe('c1');
    expect(ok('홍길동.pdf')).toBe('c1');
    expect(ok('홍길동(최종).pdf')).toBe('c1');
  });

  it('긴 이름부터 대조한다 (홍길동 vs 홍길)', () => {
    expect(ok('홍길_계획.pdf')).toBe('c2');
    expect(ok('홍길동_계획.pdf')).toBe('c1');
  });

  it('구분자 없이 다른 글자가 이어지면 짧은 이름에 붙지 않는다 (김민수 ≠ 김민)', () => {
    expect(ok('김민수_사업계획서.pdf')).toBe('no_match');
  });

  it('구분자가 없어도 흔한 서류 낱말이 바로 붙으면 인정한다', () => {
    expect(ok('홍길동사업계획서.pdf')).toBe('c1');
    expect(ok('김민참고자료.hwpx')).toBe('c3');
  });

  it('이름 사이 공백·앞쪽 괄호·영문 대소문자·NFD 파일명을 흡수한다', () => {
    expect(ok('홍 길동_사업계획서.pdf')).toBe('c1');
    expect(ok('[홍길동] 사업계획서.pdf')).toBe('c1');
    expect(ok('kim sora_plan.pdf')).toBe('c4');
    expect(ok('홍길동_사업계획서.pdf'.normalize('NFD'))).toBe('c1');
  });

  it('맨 앞이 아니면 매칭하지 않는다', () => {
    expect(ok('사업계획서_홍길동.pdf')).toBe('no_match');
  });

  it('동명이인은 고유번호·닉네임으로 구분하고, 못 하면 ambiguous', () => {
    const dup: MenteeMatchCandidate[] = [
      { caseId: 'd1', name: '이서준', externalNo: 'B-11', nickname: '서준상회' },
      { caseId: 'd2', name: '이서준', externalNo: 'B-12', nickname: '이서준' },
    ];
    expect(ok('이서준(B-12)_사업계획서.pdf', dup)).toBe('d2');
    expect(ok('이서준_B-11_계획서.pdf', dup)).toBe('d1');
    expect(ok('이서준(서준상회) 사업계획서.pdf', dup)).toBe('d1');
    const r = matchMenteeFile('이서준_사업계획서.pdf', dup);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('ambiguous');
      expect(r.message).toContain('2명');
    }
  });

  it('후보가 없으면 no_match', () => {
    expect(ok('홍길동_사업계획서.pdf', [])).toBe('no_match');
  });
});

describe('businessDocExtAllowed', () => {
  it('사업계획서는 문서 5종만, 참고파일은 이미지·엑셀도 허용', () => {
    expect(businessDocExtAllowed('business_plan', 'a.HWPX')).toBe(true);
    expect(businessDocExtAllowed('business_plan', 'a.png')).toBe(false);
    expect(businessDocExtAllowed('business_ref', 'a.png')).toBe(true);
    expect(businessDocExtAllowed('business_ref', 'a.exe')).toBe(false);
  });
});
