-- 접수내용 확인·편집: 넥스트랩 담당자가 신규 신청 접수 시 작성하는 '신청 내용 요약(기타사항)'.
alter table public.cases add column if not exists intake_note text;
