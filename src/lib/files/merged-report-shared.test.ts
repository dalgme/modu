import { describe, expect, it } from 'vitest';

import { mergedFingerprint, mergedReportStatus, mergedStoragePath, parseMergedStoragePath, roundsText, type MergedSource } from './merged-report-shared';

const src = (roundNo: number, stamp = '2026-11-01T00:00:00Z'): MergedSource => ({ roundNo, docId: `d${roundNo}`, storagePath: `case/r${roundNo}.pdf`, stamp });

describe('멘티 보고서 합본 지문·상태', () => {
  it('지문 = 회차 순서와 무관하게 같은 목록이면 같다', () => {
    expect(mergedFingerprint([src(2), src(1)])).toBe(mergedFingerprint([src(1), src(2)]));
    expect(mergedFingerprint([src(1)])).toMatch(/^[0-9a-f]{16}$/);
  });
  it('저장 경로에 지문·합친 회차를 넣고 다시 읽는다', () => {
    const fp = mergedFingerprint([src(1), src(2)]);
    const path = mergedStoragePath('case-1', fp, [2, 1]);
    expect(path).toBe(`case-1/merged-report-${fp}-r1_2.pdf`);
    expect(parseMergedStoragePath(path)).toEqual({ fingerprint: fp, includedRounds: [1, 2] });
    expect(parseMergedStoragePath('case-1/abc.pdf')).toBeNull();
  });
  it('보고서가 그대로면 최신, 합치지 못한 회차는 빠진 회차로', () => {
    const sources = [src(1), src(2), src(3)];
    const fp = mergedFingerprint(sources);
    const st = mergedReportStatus(sources, { id: 'm', name: 'x.pdf', storagePath: mergedStoragePath('c', fp, [1, 3]), createdAt: 't' });
    expect(st.stale).toBe(false);
    expect(st.includedRounds).toEqual([1, 3]);
    expect(st.missingRounds).toEqual([2]);
  });
  it('보고서가 바뀌거나 추가·삭제되면 다시 만들어야 함', () => {
    const before = [src(1), src(2)];
    const merged = { id: 'm', name: 'x.pdf', storagePath: mergedStoragePath('c', mergedFingerprint(before), [1, 2]), createdAt: 't' };
    expect(mergedReportStatus([src(1), src(2, '2026-11-05T00:00:00Z')], merged).stale).toBe(true);
    expect(mergedReportStatus([...before, src(3)], merged).stale).toBe(true);
    expect(mergedReportStatus([src(1)], merged).stale).toBe(true);
    expect(mergedReportStatus(before, null)).toMatchObject({ doc: null, stale: false, reportRounds: [1, 2] });
  });
  it('회차 표기', () => {
    expect(roundsText([1, 2, 4])).toBe('1·2·4회차');
    expect(roundsText([])).toBe('-');
  });
});
