import { describe, expect, it } from 'vitest';

import { DEFAULT_DELAY_NUDGE_TEMPLATE, renderDelayNudge, validateDelayNudgeTemplate } from './delay-nudge-template';

const cases = (n: number) => Array.from({ length: n }, (_, i) => ({ menteeName: `멘티${i + 1}`, roundsDone: 0, requiredRounds: 4, days: 30 + i }));

describe('지연 독려 문구', () => {
  it('기본 문구는 기존 고정 문구와 같은 결과', () => {
    const t = renderDelayNudge(null, { program: '행사', name: '최원서', cases: cases(2), link: 'https://x/mentor/dashboard' });
    expect(t).toBe('[행사] 최원서 멘토님, 진행이 멈춘 멘토링이 2건 있습니다.\n· 멘티1 (0/4회, 30일 경과)\n· 멘티2 (0/4회, 31일 경과)\nhttps://x/mentor/dashboard 에서 일정을 등록해 주세요.');
  });
  it('6건 이상이면 5줄 + 외 N건', () => {
    const t = renderDelayNudge(DEFAULT_DELAY_NUDGE_TEMPLATE, { program: 'P', name: 'N', cases: cases(7), link: 'L' });
    expect(t).toContain('· 멘티5');
    expect(t).not.toContain('· 멘티6');
    expect(t).toContain('외 2건');
    expect(t).toContain('7건 있습니다');
  });
  it('수정한 문구·필드 치환', () => {
    const t = renderDelayNudge('{name}님 안녕하세요. 멈춘 {count}건:\n{cases}', { program: 'P', name: '홍길동', cases: cases(1), link: 'L' });
    expect(t).toBe('홍길동님 안녕하세요. 멈춘 1건:\n· 멘티1 (0/4회, 30일 경과)');
  });
  it('검사 — 빈 문구·모르는 필드 거부', () => {
    expect(validateDelayNudgeTemplate('  ')).not.toBeNull();
    expect(validateDelayNudgeTemplate('{name} {mentee}')).toContain('{mentee}');
    expect(validateDelayNudgeTemplate('{name} 멘토님 {cases} {link}')).toBeNull();
  });
});
