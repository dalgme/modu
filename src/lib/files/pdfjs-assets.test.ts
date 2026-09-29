import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * pdf.js 워커(public/pdfjs, 저장소에 커밋)와 라이브러리(node_modules) 버전이 같아야 PDF 미리보기가 열린다.
 * pdfjs-dist 를 올렸으면 `npm run pdfjs:assets` 로 다시 복사할 것.
 */
describe('pdf.js 자산 버전', () => {
  it('public/pdfjs 가 설치된 pdfjs-dist 와 같은 버전이다', () => {
    const root = path.resolve(__dirname, '../../..');
    const lib = JSON.parse(readFileSync(path.join(root, 'node_modules/pdfjs-dist/package.json'), 'utf8')).version as string;
    const copied = readFileSync(path.join(root, 'public/pdfjs/VERSION'), 'utf8').trim();
    expect(copied).toBe(lib);
    const worker = readFileSync(path.join(root, 'public/pdfjs/pdf.worker.min.js'), 'utf8');
    expect(worker.includes(`"${lib}"`)).toBe(true);
    // 한글 CMap 이 함께 복사됐는지
    expect(readFileSync(path.join(root, 'public/pdfjs/cmaps/UniKS-UCS2-H.bcmap')).length).toBeGreaterThan(0);
  });
});
