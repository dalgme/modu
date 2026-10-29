import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 회귀 방지 (2026-10-29): /hub/enter 는 컨텍스트(행사·그룹) 쿠키를 쓰는 GET 경로라
 * next/link 로 걸면 화면에 보이는 순간 미리 불러오기(prefetch)가 실행돼 쿠키가 마지막 카드의 그룹으로 바뀐다
 * (멘토가 1기를 눌러도 2기 멘티가 보이던 원인). 화면에서는 링크 대신 서버 액션(enterContextAction) 버튼으로만 진입한다
 * — <a> 도 폰 길게 누르기 링크 미리보기가 GET 을 실행할 수 있다.
 * 같은 이유로 /api/ 라우트(내보내기 = 보안 이벤트 기록 등)도 next/link 로 걸지 않는다.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

function offenders(re: RegExp): string[] {
  const out: string[] = [];
  for (const file of walk(join(process.cwd(), 'src'))) if (re.test(readFileSync(file, 'utf8'))) out.push(file.replace(process.cwd() + '/', ''));
  return out;
}

describe('상태를 바꾸는 GET 경로는 링크 금지', () => {
  it('src 어디에서도 href="/hub/enter…" 링크(Link·a)를 쓰지 않는다', () => {
    expect(offenders(/href=\{?\s*[`'"]\/hub\/enter/)).toEqual([]);
  });
  it('/api/ 라우트를 next/link 로 걸지 않는다', () => {
    expect(offenders(/<Link\b[^>]*href=\{?\s*[`'"]\/api\//)).toEqual([]);
  });
});
