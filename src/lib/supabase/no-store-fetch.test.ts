import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { noStoreFetch } from './no-store-fetch';

describe('noStoreFetch (2026-11-16 — 예전 행을 읽는 데이터 캐시 장애 회귀 방지)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('모든 요청에 cache: no-store 를 붙이고 나머지 옵션은 유지한다', async () => {
    const spy = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', spy);
    await noStoreFetch('https://example.test/rest/v1/documents', { method: 'GET', headers: { a: '1' }, cache: 'force-cache' });
    expect(spy).toHaveBeenCalledWith('https://example.test/rest/v1/documents', { method: 'GET', headers: { a: '1' }, cache: 'no-store' });
  });

  it('서버 Supabase 클라이언트(관리자·세션) 둘 다 noStoreFetch 를 쓴다', () => {
    for (const f of ['admin.ts', 'server.ts']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src, f).toMatch(/global:\s*\{\s*fetch:\s*noStoreFetch\s*\}/);
    }
  });
});
