-- 0062 (2026-09-08) 명단 운영 보강
--  - users.organization: 소속(멘토의 회사/기관, 스태프의 부서 등). 멘티의 소속 기업은 cases.business_name 이 원본.
--  - roster_columns / roster_values: 행사별 멘티·멘토 리스트의 "임의 컬럼"(카테고리 마크). 헤더는 운영사가 정의, 값은 회원별 자유 텍스트.

alter table public.users add column if not exists organization text;

create table if not exists public.roster_columns (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  target public.user_role not null,          -- mentee | mentor (리스트별 컬럼)
  name text not null,
  sort_order int not null default 0,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (program_id, target, name)
);

create table if not exists public.roster_values (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.roster_columns (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  value text not null default '',
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (column_id, user_id)
);

alter table public.roster_columns enable row level security;
alter table public.roster_values enable row level security;
create policy roster_columns_select on public.roster_columns for select
  using (private.is_program_staff(program_id));
create policy roster_values_select on public.roster_values for select
  using (exists (select 1 from public.roster_columns c where c.id = column_id and private.is_program_staff(c.program_id)));
-- 쓰기는 service_role(운영사 서버 액션)만
