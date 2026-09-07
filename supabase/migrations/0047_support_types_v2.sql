-- ============================================================================
-- 0047_support_types_v2.sql  (docs/MODU-DESIGN.md §2-2, §5-3, §6-2, §20)
-- 사업그룹 동적화: enum code → text, 행사 소속, 회차 수, 승계 원천, 그룹 일괄 원천징수 방식,
-- 그룹 명부(support_type_members: 멘토·스태프 + 멘토별 원천징수 override), 그룹별 필수서류 옵션.
-- 금액 지원 개념(limit_amount / calc_method / area_unit_price)은 삭제.
-- ============================================================================

-- 1) support_types
alter table public.support_types drop constraint if exists support_types_code_key;
alter table public.support_types alter column code type text using code::text;
alter table public.support_types
  drop column if exists limit_amount,
  drop column if exists calc_method,
  drop column if exists area_unit_price;
alter table public.support_types
  add column program_id uuid not null references public.programs (id) on delete restrict,
  add column status text not null default 'active' check (status in ('active', 'ended')),
  add column required_rounds integer not null default 4 check (required_rounds between 1 and 20),
  add column round_label text not null default '컨설팅',
  add column withholding_method text
    check (withholding_method in ('other_income', 'business_income', 'none')),   -- null = 행사 기본
  add column predecessor_support_type_id uuid references public.support_types (id) on delete set null,
  add column starts_on date,
  add column ends_on date,
  add column sort_order integer not null default 0;
alter table public.support_types
  add constraint support_types_program_code_key unique (program_id, code);
create index support_types_program_idx on public.support_types (program_id, status);

drop type if exists public.support_type_code;
drop type if exists public.calc_method;

-- 2) 그룹별 필수서류: 복수 허용 여부 + 제출 주체
alter table public.support_type_documents
  add column multiple boolean not null default false,
  add column for_role text not null default 'mentee' check (for_role in ('mentee', 'mentor', 'staff'));

-- 3) 그룹 명부 (멘토·스태프). 멘티는 cases 로 귀속.
create table public.support_type_members (
  id uuid primary key default gen_random_uuid(),
  support_type_id uuid not null references public.support_types (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  member_role text not null check (member_role in ('mentor', 'staff')),
  is_active boolean not null default true,
  -- 그룹 안에서만 유효한 멘토별 원천징수 방식 (null = 그룹 일괄 → 행사 기본)
  withholding_method text check (withholding_method in ('other_income', 'business_income', 'none')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (support_type_id, user_id)
);
create index support_type_members_user_idx on public.support_type_members (user_id) where is_active;
create trigger support_type_members_set_updated_at before update on public.support_type_members
  for each row execute function public.set_updated_at();

-- 4) 헬퍼
create or replace function private.support_type_program(stid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select program_id from public.support_types where id = stid;
$$;

-- 5) RLS — 행사 범위
drop policy if exists support_types_select on public.support_types;
drop policy if exists support_types_write on public.support_types;
create policy support_types_select on public.support_types for select
  using (private.is_program_member(program_id) or private.is_platform_admin());
create policy support_types_write on public.support_types for all
  using (private.is_program_nextlab(program_id)) with check (private.is_program_nextlab(program_id));

drop policy if exists support_type_documents_select on public.support_type_documents;
drop policy if exists support_type_documents_write on public.support_type_documents;
create policy support_type_documents_select on public.support_type_documents for select
  using (private.is_program_member(private.support_type_program(support_type_id)) or private.is_platform_admin());
create policy support_type_documents_write on public.support_type_documents for all
  using (private.is_program_nextlab(private.support_type_program(support_type_id)))
  with check (private.is_program_nextlab(private.support_type_program(support_type_id)));

alter table public.support_type_members enable row level security;
create policy support_type_members_select on public.support_type_members for select
  using (user_id = auth.uid() or private.is_program_staff(private.support_type_program(support_type_id)));
create policy support_type_members_write on public.support_type_members for all
  using (private.is_program_nextlab(private.support_type_program(support_type_id)))
  with check (private.is_program_nextlab(private.support_type_program(support_type_id)));
