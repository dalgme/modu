-- ============================================================================
-- 0049_rounds_rates_limits.sql  (docs/MODU-DESIGN.md §4, §6-1)
-- 컨설팅 유형 enum, 단가 이력(consulting_rates), 운영 한도 이력(operating_limits · 행사 단위 + 그룹 override),
-- mentoring_logs v2(회차 번호·유형·시작/종료·단가 스냅샷·멘티 서명·추가 회차), 추가 회차 요청.
-- ============================================================================

create type public.consulting_mode as enum ('online', 'offline');

-- 1) 단가 (행사 기본 = support_type_id null, 그룹 override 가능). 변경은 행 추가(effective_from)로만.
create table public.consulting_rates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  support_type_id uuid references public.support_types (id) on delete cascade,
  mode public.consulting_mode not null,
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  daily_cap_amount numeric(14, 2) not null check (daily_cap_amount >= unit_price),   -- 같은 멘티·같은 날 유형별 합산 상한
  effective_from date not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index consulting_rates_scope_key
  on public.consulting_rates (program_id, coalesce(support_type_id, '00000000-0000-0000-0000-000000000000'::uuid), mode, effective_from);

-- 2) 운영 한도 (행사 단위 기본, 그룹 override 선택)
create table public.operating_limits (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  support_type_id uuid references public.support_types (id) on delete cascade,
  mentor_daily_case_limit integer not null default 3 check (mentor_daily_case_limit between 1 and 50),  -- 멘토 1일 최대 멘티 수
  case_daily_round_limit integer not null default 3 check (case_daily_round_limit between 1 and 20),    -- 같은 멘티 1일 최대 회차
  effective_from date not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index operating_limits_scope_key
  on public.operating_limits (program_id, coalesce(support_type_id, '00000000-0000-0000-0000-000000000000'::uuid), effective_from);

-- 3) mentoring_logs v2 — 1회차 = 1행 (웹작성이든 파일 업로드든)
alter table public.mentoring_logs
  drop column if exists visited_at,
  drop column if exists duration_minutes;
alter table public.mentoring_logs alter column content drop not null;   -- report_kind='file' 이면 본문 없이 첨부
alter table public.mentoring_logs
  add column round_no integer not null check (round_no >= 1),
  add column mode public.consulting_mode not null,
  add column started_at timestamptz not null,
  add column ended_at timestamptz not null,
  add column report_kind text not null default 'web' check (report_kind in ('web', 'file')),
  add column unit_price_snapshot numeric(14, 2) not null check (unit_price_snapshot >= 0),
  add column amount_snapshot numeric(14, 2) not null check (amount_snapshot >= 0),
  add column rate_id uuid references public.consulting_rates (id) on delete set null,
  add column mentee_signed_at timestamptz,
  add column is_extra boolean not null default false,
  add constraint mentoring_logs_time_check check (ended_at > started_at);
create unique index mentoring_logs_case_round_key on public.mentoring_logs (case_id, round_no);
create index mentoring_logs_mentor_started_idx on public.mentoring_logs (mentor_id, started_at);
create index mentoring_logs_case_started_idx on public.mentoring_logs (case_id, started_at);

-- 4) 추가 회차 요청 (멘토 → 렛츠 승인)
create table public.round_extension_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  requested_by uuid not null references public.users (id) on delete restrict,
  reason text not null,
  extra_rounds integer not null default 1 check (extra_rounds between 1 and 10),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index round_extension_requests_case_idx on public.round_extension_requests (case_id, status);
create trigger round_extension_requests_set_updated_at before update on public.round_extension_requests
  for each row execute function public.set_updated_at();

-- 5) RLS
alter table public.consulting_rates enable row level security;
create policy consulting_rates_select on public.consulting_rates for select
  using (private.is_program_member(program_id) or private.is_platform_admin());
create policy consulting_rates_write on public.consulting_rates for all
  using (private.is_program_nextlab(program_id)) with check (private.is_program_nextlab(program_id));

alter table public.operating_limits enable row level security;
create policy operating_limits_select on public.operating_limits for select
  using (private.is_program_member(program_id) or private.is_platform_admin());
create policy operating_limits_write on public.operating_limits for all
  using (private.is_program_nextlab(program_id)) with check (private.is_program_nextlab(program_id));

alter table public.round_extension_requests enable row level security;
create policy round_extension_requests_select on public.round_extension_requests for select
  using (private.can_access_case(case_id));
create policy round_extension_requests_insert on public.round_extension_requests for insert
  with check (requested_by = auth.uid() and private.is_mentor_of(case_id));
create policy round_extension_requests_update on public.round_extension_requests for update
  using (private.is_program_nextlab(private.case_program(case_id)))
  with check (private.is_program_nextlab(private.case_program(case_id)));

-- mentoring_logs 정책은 can_access_case / is_mentor_of / is_staff 기반 그대로 (0048 에서 can_access_case 가 행사 범위로 재정의됨)
drop policy if exists mentoring_logs_insert on public.mentoring_logs;
create policy mentoring_logs_insert on public.mentoring_logs for insert
  with check (private.is_mentor_of(case_id) or private.is_program_staff(private.case_program(case_id)));
drop policy if exists mentoring_logs_update on public.mentoring_logs;
create policy mentoring_logs_update on public.mentoring_logs for update
  using (private.is_mentor_of(case_id) or private.is_program_staff(private.case_program(case_id)))
  with check (private.is_mentor_of(case_id) or private.is_program_staff(private.case_program(case_id)));
