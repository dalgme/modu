-- 0078 (2026-09-24) P29 — 멘토 리마인더(진행 독려) 문자를 행사·그룹별로 설정
--  - 기존: app_settings 의 플랫폼 전역 문구/on-off + 매주 월요일 12:30 고정 cron (행사 구분 없음)
--  - 변경: mentor_reminder_settings 행 = 행사 공통(support_type_id null) 또는 그룹 override.
--    그룹 행이 있으면 그 그룹은 그 행으로만 판정(enabled=false 도 명시적 off), 없으면 행사 공통, 공통도 없으면 미발송.
--    요일(0=일~6=토)·시각(KST, 시·분)은 행마다 다르며 cron 은 매시 :30 에 돌면서 "오늘 그 시각이 지났고 아직 오늘 안 보낸" 행을 발송한다.
--  - 문구 치환: {program} {group} {mentor} {companies}

create table public.mentor_reminder_settings (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  support_type_id uuid references public.support_types (id) on delete cascade,
  enabled boolean not null default false,
  weekday smallint not null default 1 check (weekday between 0 and 6),
  send_hour smallint not null default 12 check (send_hour between 0 and 23),
  send_minute smallint not null default 30 check (send_minute in (0, 10, 20, 30, 40, 50)),
  template text not null,
  last_sent_on date,
  last_result jsonb,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index mentor_reminder_settings_scope_key
  on public.mentor_reminder_settings (program_id, coalesce(support_type_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.mentor_reminder_settings enable row level security;
-- 서비스롤 전용 (조회·수정은 전부 서버 액션 경로)

-- 기존 전역 설정을 활성 행사의 '행사 공통' 행으로 이관 (문구·on/off, 월요일 12:30)
insert into public.mentor_reminder_settings (program_id, support_type_id, enabled, weekday, send_hour, send_minute, template)
select p.id, null,
       coalesce((select value from public.app_settings where key = 'mentor_weekly_reminder_enabled'), 'true') <> 'false',
       1, 12, 30,
       coalesce(nullif((select value from public.app_settings where key = 'mentor_weekly_reminder_template'), ''),
                '[{program}] {mentor}멘토님, 이번주에도 [{companies}] 멘티에 대한 컨설팅 회차 등록·보고서 작성 진행 잘 부탁드리겠습니다')
from public.programs p
where p.status = 'active';
