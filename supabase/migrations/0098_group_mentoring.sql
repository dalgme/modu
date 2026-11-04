-- 0098 그룹멘토링 (2026-11-04)
-- 라운드(사업그룹)별로 운영사가 그룹멘토링 사용 여부와 멘토 1인당 최대 횟수를 정한다.
-- 그룹멘토링 1회 = group_mentoring_sessions 1행 + 참여 멘티마다 mentoring_logs 1행(각 멘티 1회차·멘티별 보고서).
-- 수당은 세션당 1회분 — 참여 회차 중 한 행(group_fee_holder)만 금액을 갖고 나머지는 0원(코드 group-mentoring-rule.ts 가 배정).

alter table public.support_types
  add column if not exists group_mentoring_enabled boolean not null default false,
  add column if not exists group_mentoring_max_per_mentor smallint not null default 1;
alter table public.support_types drop constraint if exists support_types_group_mentoring_max_chk;
alter table public.support_types add constraint support_types_group_mentoring_max_chk check (group_mentoring_max_per_mentor between 0 and 20);
comment on column public.support_types.group_mentoring_enabled is '라운드별 그룹멘토링 사용 여부 (기본 꺼짐)';
comment on column public.support_types.group_mentoring_max_per_mentor is '이 라운드에서 멘토 1인당 등록할 수 있는 그룹멘토링 최대 횟수';

create table if not exists public.group_mentoring_sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  support_type_id uuid not null references public.support_types(id) on delete cascade,
  mentor_id uuid not null references public.users(id) on delete cascade,
  mode public.consulting_mode not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  place text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists group_mentoring_sessions_mentor_idx on public.group_mentoring_sessions(support_type_id, mentor_id);
create index if not exists group_mentoring_sessions_program_idx on public.group_mentoring_sessions(program_id, started_at);

alter table public.group_mentoring_sessions enable row level security;
-- 열람: 담당 멘토 본인 + 행사 스태프. 쓰기는 service_role(서버 액션)만 — 배정 관계 검증은 코드에서.
drop policy if exists group_mentoring_sessions_select on public.group_mentoring_sessions;
create policy group_mentoring_sessions_select on public.group_mentoring_sessions for select
  using (mentor_id = auth.uid() or private.is_program_staff(program_id));

alter table public.mentoring_logs
  add column if not exists group_session_id uuid references public.group_mentoring_sessions(id) on delete set null,
  add column if not exists group_fee_holder boolean not null default false;
create index if not exists mentoring_logs_group_session_idx on public.mentoring_logs(group_session_id) where group_session_id is not null;
comment on column public.mentoring_logs.group_session_id is '그룹멘토링 회차면 그 세션 — 참여 멘티마다 1행씩';
comment on column public.mentoring_logs.group_fee_holder is '그룹멘토링 수당(1회분)을 갖는 회차 — 세션당 1행, 나머지 참여 회차는 금액 0';
