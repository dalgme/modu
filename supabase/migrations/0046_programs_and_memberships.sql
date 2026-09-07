-- ============================================================================
-- 0046_programs_and_memberships.sql  (모두의창업 P1 · docs/MODU-DESIGN.md §1, §17, §18)
-- 다중 행사(프로그램) 계층 + 멤버십(1계정 = 여러 행사) + 플랫폼 관리자 플래그 + 행사 범위 RLS 헬퍼
-- 전제: 새 DB(모든 테이블 0행). 원본 restart 스키마(0001~0045) 위에 적용한다.
-- ============================================================================

-- 1) 행사(프로그램) — 브랜딩(§17)·정산 정책(§6-2)·종결 게이트(§16)를 전부 여기서 읽는다.
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  name text not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  starts_on date,
  ends_on date,
  -- 발주처
  client_name text not null,
  client_short text,
  client_seal_name text,
  client_logo_path text,
  -- 용역사(운영)
  operator_name text not null,
  operator_short text,
  operator_contact text,
  -- 앱 브랜딩
  app_title text,
  logo_path text,
  sms_footer text,
  email_subject_prefix text,
  -- 정산 정책: 행사 기본 원천징수 방식 + 방식별 파라미터 (그룹·멘토별 override 는 0047)
  default_withholding_method text not null default 'other_income'
    check (default_withholding_method in ('other_income', 'business_income', 'none')),
  withholding_params jsonb not null default '{
    "other_income":    {"expense_rate": 0.6, "tax_rate": 0.20, "local_rate": 0.10, "rounding": "floor_10", "min_taxable_exempt": 50000},
    "business_income": {"tax_rate": 0.03, "local_rate": 0.10, "rounding": "floor_10"}
  }'::jsonb,
  -- 종결 게이트 (기본 전부 꺼짐 — 2차 답변 4)
  closure_policy jsonb not null default '{
    "require_mentee_signature": false,
    "require_group_docs": false,
    "block_batch_on_missing_mentor_docs": false
  }'::jsonb,
  default_required_rounds integer not null default 4 check (default_required_rounds between 1 and 20),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger programs_set_updated_at before update on public.programs
  for each row execute function public.set_updated_at();

-- 2) 행사 멤버십 — 역할은 users.role(계정 전역). 한 계정이 여러 행사에 귀속될 수 있다.
create table public.program_members (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, user_id)
);
create index program_members_user_idx on public.program_members (user_id) where is_active;
create trigger program_members_set_updated_at before update on public.program_members
  for each row execute function public.set_updated_at();

-- 3) 플랫폼 관리자 플래그 (역할 enum 은 늘리지 않는다)
alter table public.users add column is_platform_admin boolean not null default false;

-- 4) 행사 범위 RLS 헬퍼 (private 스키마 · SECURITY DEFINER · auth.uid() 기준)
create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users
    where id = auth.uid() and is_platform_admin and is_active);
$$;

create or replace function private.is_program_member(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.program_members
    where program_id = pid and user_id = auth.uid() and is_active);
$$;

-- 행사 스태프 = (institution ∪ nextlab) ∧ 그 행사 멤버, 또는 플랫폼 관리자
create or replace function private.is_program_staff(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_platform_admin()
      or (private.is_staff() and private.is_program_member(pid));
$$;

create or replace function private.is_program_nextlab(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_platform_admin()
      or (private.is_nextlab() and private.is_program_member(pid));
$$;

-- 두 계정이 같은 행사(활성 멤버십)를 하나라도 공유하는가 — users_select 용
create or replace function private.shares_program_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.program_members a
    join public.program_members b on b.program_id = a.program_id
    where a.user_id = auth.uid() and a.is_active
      and b.user_id = other and b.is_active
  );
$$;

-- 5) RLS
alter table public.programs enable row level security;
create policy programs_select on public.programs for select
  using (private.is_platform_admin() or private.is_program_member(id));
create policy programs_insert on public.programs for insert
  with check (private.is_platform_admin());
create policy programs_update on public.programs for update
  using (private.is_program_nextlab(id)) with check (private.is_program_nextlab(id));

alter table public.program_members enable row level security;
create policy program_members_select on public.program_members for select
  using (user_id = auth.uid() or private.is_program_staff(program_id));
create policy program_members_write on public.program_members for all
  using (private.is_program_nextlab(program_id)) with check (private.is_program_nextlab(program_id));

-- users: 본인 / 플랫폼 관리자 / 같은 행사를 공유하는 스태프
drop policy if exists users_select on public.users;
create policy users_select on public.users for select
  using (
    id = auth.uid()
    or private.is_platform_admin()
    or (private.is_staff() and private.shares_program_with(id))
  );
