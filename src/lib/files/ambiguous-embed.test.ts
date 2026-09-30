import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 회귀 방지 (2026-09-30 장애): documents 에는 cases 로 가는 외래키가 둘(case_id · copied_from_case_id)이라
 * `from('documents').select('…, cases(…)')` / `cases!inner(…)` 임베드는 PostgREST 가 모호성 오류를 낸다.
 * 코드가 오류를 "행 없음"으로 받아 모든 파일 미리보기·다운로드가 404 가 됐다. 케이스는 따로 조회할 것.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('documents → cases 임베드 금지', () => {
  it('src 어디에서도 documents 조회에 cases 를 임베드하지 않는다', () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src'))) {
      const src = readFileSync(file, 'utf8');
      const re = /from\('documents'\)[\s\S]{0,300}?\.select\(\s*['`]([^'`]*)['`]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (/\bcases\s*(!\w+)*\s*\(/.test(m[1] ?? '')) offenders.push(file.replace(process.cwd() + '/', ''));
      }
    }
    expect(offenders).toEqual([]);
  });
});
