/**
 * 서버 Supabase 클라이언트 전용 fetch — 항상 `cache: 'no-store'` (2026-11-16 장애 대응).
 *
 * Next.js 14 는 서버에서 부르는 GET fetch 를 데이터 캐시에 담아 다음 요청에 재사용할 수 있다.
 * Supabase 조회(PostgREST GET)가 캐시되면 방금 바뀐 행 대신 예전 행이 돌아온다 — 실제로 회차 보고서를
 * [수정 업로드]한 직후 미리보기·다운로드가 지워진 예전 파일 경로로 서명을 요청해 "Object not found" 가 났다
 * (10-09 ~ 11-16 45건·9명, 합본 PDF 다시 만들기·관찰의견서 교체도 같은 유형).
 * `dynamic = 'force-dynamic'` 만으로는 막히지 않아 클라이언트 단에서 강제한다.
 */
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });
