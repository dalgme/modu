import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 회귀 방지 (2026-10-29): /hub/enter 는 컨텍스트(행사·그룹) 쿠키를 쓰는 GET 경로라
 * next/link 로 걸면 화면에 보이는 순간 미리 불러오기(prefetch)가 실행돼 쿠키가 마지막 카드의 그룹으로 바뀐다
 * (멘토가 1기를 눌러도 2기 멘티가 보이던 원인). /hub/enter 링크는 <a> 로만 건다.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

describe('/hub/enter 는 Link 금지', () => {
  it('src 어디에서도 <Link href="/hub/enter…"> 를 쓰지 않는다', () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src'))) {
      const src = readFileSync(file, 'utf8');
      if (/<Link\b[^>]*href=\{?\s*[`'"]\/hub\/enter/.test(src)) offenders.push(file.replace(process.cwd() + '/', ''));
    }
    expect(offenders).toEqual([]);
  });
});
