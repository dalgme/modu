-- 임시 수정권한 (넥스트랩 검수 완료 단계에서 한시적으로 수정 허용).
-- 넥스트랩만 개설/마감할 수 있고, 별도 설정이 없으면 24시간 후 자동 만료(expires_at)된다.
create table if not exists public.case_edit_grants (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  -- 수정권한 대상(표시·감사용): 넥스트랩 또는 담당 멘토
  target text not null check (target in ('nextlab', 'mentor')),
  granted_by uuid references public.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  closed_by uuid references public.users(id),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists case_edit_grants_case_idx on public.case_edit_grants(case_id);
create index if not exists case_edit_grants_active_idx
  on public.case_edit_grants(case_id, expires_at) where closed_at is null;

alter table public.case_edit_grants enable row level security;

-- 조회: 케이스 접근 권한자(운영진·담당 멘토·멘티). 개설/마감은 서버 액션(admin)에서만 수행.
drop policy if exists case_edit_grants_select on public.case_edit_grants;
create policy case_edit_grants_select on public.case_edit_grants for select
  using (private.can_access_case(case_id));
