-- 0060 (2026-09-08) 담당자 직위·행사/그룹별 담당역할·운영사 등급(PL/PM/부PM/옵저버)·행사별 권한 override·플랫폼 owner·종합결과리포트 스냅샷

-- 1) 직위 (발주처·용역사 담당자 필수 입력, 나머지 선택)
alter table public.users add column if not exists position text;

-- 2) 플랫폼 관리자 계층: owner(통합관리자, 부트스트랩 계정) / admin(부관리자). owner 만 admin 을 지정·해제한다.
alter table public.users add column if not exists platform_role text
  check (platform_role in ('owner','admin'));
update public.users u set platform_role = 'owner'
 where u.is_platform_admin and u.platform_role is null
   and u.id = (select a.entity_id::uuid from public.audit_logs a where a.action = 'account.bootstrap' order by a.created_at limit 1);
update public.users set platform_role = 'admin' where is_platform_admin and platform_role is null;

-- 3) 행사별 담당: 운영사 등급 + 담당역할 메모. 그룹별 담당역할 메모.
alter table public.program_members add column if not exists grade text
  check (grade in ('pl','pm','deputy_pm','observer'));
alter table public.program_members add column if not exists duty text;
alter table public.support_type_members add column if not exists duty text;
comment on column public.program_members.grade is '운영사(nextlab) 역할일 때의 등급: pl 메인 담당 / pm / deputy_pm 부PM / observer 옵저버(열람·자문). null = pl 로 취급';
comment on column public.program_members.duty is '이 행사에서의 담당역할 메모 (예: 정산 담당, A그룹 담당)';

-- 4) 행사별 권한 override — { "<grade>": ["capability", ...] } 비어 있으면 코드 기본표(src/lib/auth/capabilities.ts)
alter table public.programs add column if not exists staff_permissions jsonb not null default '{}'::jsonb;

-- 5) 종합결과리포트 스냅샷 (생성일 기준 고정본)
create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  support_type_id uuid references public.support_types (id) on delete set null,
  title text not null,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.users (id) on delete set null,
  metrics jsonb not null,
  narrative jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists report_snapshots_program_idx on public.report_snapshots (program_id, generated_at desc);
alter table public.report_snapshots enable row level security;
drop policy if exists report_snapshots_select on public.report_snapshots;
create policy report_snapshots_select on public.report_snapshots for select
  using (private.is_program_staff(program_id));
-- 쓰기는 service_role 경로(서버 액션)만

-- 6) 플랫폼 관리자 = 통합관리 전용 계정. 행사·그룹 소속을 가질 수 없고, 소속이 있는 계정은 플랫폼 관리자가 될 수 없다.
delete from public.support_type_members where user_id in (select id from public.users where is_platform_admin);
delete from public.program_members where user_id in (select id from public.users where is_platform_admin);

create or replace function public.program_members_reject_platform_admin()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from public.users where id = new.user_id and is_platform_admin) then
    raise exception '플랫폼 관리자 계정은 행사 소속을 가질 수 없습니다 (통합관리 전용 계정)';
  end if;
  return new;
end;
$$;
drop trigger if exists program_members_reject_platform_admin on public.program_members;
create trigger program_members_reject_platform_admin before insert or update on public.program_members
  for each row execute function public.program_members_reject_platform_admin();
drop trigger if exists support_type_members_reject_platform_admin on public.support_type_members;
create trigger support_type_members_reject_platform_admin before insert or update on public.support_type_members
  for each row execute function public.program_members_reject_platform_admin();

create or replace function public.users_platform_admin_no_membership()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_platform_admin and not coalesce(old.is_platform_admin, false)
     and exists (select 1 from public.program_members where user_id = new.id and is_active) then
    raise exception '행사에 소속된 계정은 플랫폼 관리자로 지정할 수 없습니다. 통합관리 전용 계정을 발급하세요';
  end if;
  return new;
end;
$$;
drop trigger if exists users_platform_admin_no_membership on public.users;
create trigger users_platform_admin_no_membership before update of is_platform_admin on public.users
  for each row execute function public.users_platform_admin_no_membership();
