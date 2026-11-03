-- 0095 — 멘티(케이스)별 멘토링 결과 구분 (2026-11-03)
-- 운영사가 회원 명단 > 멘티 > [정보 수정]에서 '멘토링 포기' / '멘토링 종료'를 눌러 표시한다.
-- 상태머신(case_status)·정산과 무관한 표시값이며, 리포트 [회차별 현황]의 종료·포기 분류가 이 값을 우선한다.
alter table public.cases
  add column if not exists mentoring_outcome text check (mentoring_outcome in ('gave_up', 'ended')),
  add column if not exists mentoring_outcome_at timestamptz,
  add column if not exists mentoring_outcome_by uuid references public.users(id) on delete set null;

comment on column public.cases.mentoring_outcome is '운영사 지정 멘토링 결과 구분: gave_up(멘토링 포기) / ended(멘토링 종료) / null(구분 없음)';
