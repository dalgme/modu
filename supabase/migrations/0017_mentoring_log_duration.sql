-- 멘토링 일지: 방문 소요 시간(분). 방문 일시를 'HH:MM~HH:MM (N시간)' 범위로 기록하기 위한 필드.
alter table public.mentoring_logs
  add column if not exists duration_minutes integer;

comment on column public.mentoring_logs.duration_minutes is '방문 소요 시간(분). 기본 1회 60분.';
