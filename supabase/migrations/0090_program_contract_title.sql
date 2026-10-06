-- 0090 (2026-10-06) 용역명 — 엑셀 파일명 등 공식 문서명에 쓰는 행사의 정식 용역 명칭.
-- 예) 매칭 리스트 엑셀: "(멘토별)멘토링 진행 현황_{용역명}_{운영사}_{YYMMDD}.xlsx". 비어 있으면 행사명을 쓴다.
alter table public.programs add column if not exists contract_title text;
comment on column public.programs.contract_title is '용역명(정식 명칭) — 엑셀 파일명 등 공식 문서명. null 이면 행사명(name) 사용';
