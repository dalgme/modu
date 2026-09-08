-- 0059 행사별 역할 (설계 B, 2026-09-08)
-- 한 계정이 행사마다 다른 역할(멘토/멘티/운영사/발주처)을 가질 수 있다.
--  - program_members.role = 그 행사 안에서의 역할 (가드·화면·명단·알림 수신자가 이 값을 읽는다)
--  - users.role           = 기본 역할 (행사 밖 화면, 새 소속 시 기본값, 하위 호환)
--  - RLS 헬퍼 is_staff/is_nextlab/is_institution 는 "어느 행사에서든 그 역할" 로 완화하고,
--    행사 범위 판단은 program_role(pid) 로 정확히 한다. (데이터 정책은 소유 조건으로 따로 좁혀진다)

alter table public.program_members add column if not exists role public.user_role;

update public.program_members pm
   set role = u.role
  from public.users u
 where u.id = pm.user_id and pm.role is null;

-- insert 시 role 을 비우면 users.role 로 채운다 (기존 upsert 호환)
create or replace function public.program_members_default_role()
returns trigger language plpgsql as $$
begin
  if new.role is null then
    select role into new.role from public.users where id = new.user_id;
  end if;
  return new;
end;
$$;
drop trigger if exists program_members_default_role on public.program_members;
create trigger program_members_default_role before insert on public.program_members
  for each row execute function public.program_members_default_role();

alter table public.program_members alter column role set not null;
create index if not exists program_members_program_role_idx on public.program_members (program_id, role) where is_active;

comment on column public.program_members.role is '이 행사 안에서의 역할. 가드·명단·알림 수신자는 이 값을 읽는다.';
comment on column public.users.role is '기본 역할 — 행사 밖 화면·새 소속의 기본값. 행사 안 역할은 program_members.role';

-- RLS 헬퍼
create or replace function private.has_role(r public.user_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and u.is_active
       and (u.role = r or exists (
         select 1 from public.program_members pm
          where pm.user_id = u.id and pm.is_active and pm.role = r))
  );
$$;

create or replace function private.program_role(pid uuid)
returns public.user_role language sql stable security definer set search_path = public as $$
  select coalesce(
    (select pm.role from public.program_members pm
      where pm.program_id = pid and pm.user_id = auth.uid() and pm.is_active limit 1),
    (select u.role from public.users u where u.id = auth.uid())
  );
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select private.has_role('institution') or private.has_role('nextlab');
$$;

create or replace function private.is_institution()
returns boolean language sql stable security definer set search_path = public as $$
  select private.has_role('institution');
$$;

create or replace function private.is_nextlab()
returns boolean language sql stable security definer set search_path = public as $$
  select private.has_role('nextlab');
$$;

create or replace function private.is_program_staff(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_platform_admin()
      or (private.is_program_member(pid) and private.program_role(pid) in ('institution','nextlab'));
$$;

create or replace function private.is_program_nextlab(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_platform_admin()
      or (private.is_program_member(pid) and private.program_role(pid) = 'nextlab');
$$;

-- 보안 어드바이저: 트리거 함수 search_path 고정
alter function public.program_members_default_role() set search_path = public;
