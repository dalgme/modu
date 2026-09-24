/**
 * Supabase PostgREST 는 요청당 최대 1,000행(기본 max_rows)만 돌려준다. 멘티 400명 × 회차 4 = 1,600행처럼
 * 행사 단위 집계가 캡을 넘으면 수치가 **조용히** 잘리므로, 범위 전체를 읽는 조회는 반드시 이 헬퍼로 페이지를 돈다 (P30).
 * `in()` 대상 id 가 많으면 URL 길이도 문제라 200개 단위로 쪼갠다.
 */

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export const PAGE_SIZE = 1000;
export const IN_CHUNK = 200;

/** `.range(from, to)` 를 붙일 수 있는 빌더를 받아 끝까지 읽는다. */
export async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<PageResult<T>>, pageSize = PAGE_SIZE): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await make(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** ids 를 청크로 나눠 각 청크를 fetchAll 로 읽고 합친다. ids 가 비면 빈 배열. */
export async function fetchAllIn<T>(ids: string[], make: (chunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>, chunkSize = IN_CHUNK): Promise<T[]> {
  const uniq = Array.from(new Set(ids));
  if (uniq.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    out.push(...(await fetchAll<T>((from, to) => make(chunk, from, to))));
  }
  return out;
}
