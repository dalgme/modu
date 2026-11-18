-- 2026-11-18 (P83) 수당 양식·총괄표 엑셀 제목·권역(행사 설정) + 회차 보고서 '멘토링 주제' 추출값
alter table public.programs
  add column if not exists allowance_title text,
  add column if not exists summary_title text,
  add column if not exists report_region text;
comment on column public.programs.allowance_title is '멘토링 수당 양식 제목 앞부분 — "{값} {라운드} 진출자 멘토링 수당". 비우면 용역명→행사명';
comment on column public.programs.summary_title is '멘토링 총괄표 제목. 비우면 "{연도} {행사명} 멘토링 총괄표"';
comment on column public.programs.report_region is '멘토링 총괄표 권역 칸 값';

alter table public.mentoring_logs
  add column if not exists report_topic text,
  add column if not exists report_topic_doc_path text,
  add column if not exists report_topic_at timestamptz;
comment on column public.mentoring_logs.report_topic is '업로드 보고서의 "멘토링 주제" 칸 글자(브라우저 추출). null = 못 찾음';
comment on column public.mentoring_logs.report_topic_doc_path is '추출에 쓴 보고서 파일 경로 — 보고서가 바뀌면(경로가 다르면) 다시 추출';

-- 현재 행사(모두의창업) 값 — 사용자 제공 양식 기준
update public.programs
   set allowance_title = coalesce(allowance_title, '모두의 창업 로컬트랙(중부권)'),
       summary_title = coalesce(summary_title, '2026 모두의 창업(로컬트랙) 멘토링 총괄표'),
       report_region = coalesce(report_region, '중부권')
 where id = '84b46f53-ea17-4128-903a-56dccfa5a816';
