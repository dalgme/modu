import { describe, expect, it } from 'vitest';

import { asciiFallback, contentDisposition, rfc5987, safeFileName } from './download';

describe('download filename helpers (P33)', () => {
  it('한글 파일명은 filename* 로, ASCII 폴백을 함께 보낸다', () => {
    const h = contentDisposition('모두의창업_전체_리포트_2026-09-24.xlsx');
    expect(h).toContain('attachment; filename="_2026-09-24.xlsx"'.replace('"_', '"'));
    expect(h).toContain("filename*=UTF-8''%EB%AA%A8%EB%91%90%EC%9D%98%EC%B0%BD%EC%97%85_%EC%A0%84%EC%B2%B4_%EB%A6%AC%ED%8F%AC%ED%8A%B8_2026-09-24.xlsx");
  });
  it('괄호·따옴표·별표는 RFC 5987 로 퍼센트 인코딩한다', () => {
    expect(rfc5987("품의(1차)*'!")).toBe('%ED%92%88%EC%9D%98%281%EC%B0%A8%29%2A%27%21');
  });
  it('금지 문자·제어 문자·연속 공백을 정리하고 길이를 제한한다', () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j\u0001k  l.xlsx')).toBe('a b c d e f g h i j k l.xlsx');
    expect(safeFileName('가'.repeat(200) + '.xlsx', 20).endsWith('.xlsx')).toBe(true);
    expect(safeFileName('가'.repeat(200) + '.xlsx', 20).length).toBeLessThanOrEqual(20);
  });
  it('ASCII 폴백은 비 ASCII 를 지우고 비면 download.<ext> 로 한다', () => {
    expect(asciiFallback('감사로그.xlsx')).toBe('download.xlsx');
    expect(asciiFallback('modu_감사로그_2026.xlsx')).toBe('modu_2026.xlsx');
    expect(contentDisposition('지급품의서.pdf', { inline: true }).startsWith('inline; filename="download.pdf"')).toBe(true);
  });
});
