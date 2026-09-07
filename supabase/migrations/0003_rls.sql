-- ============================================================================
-- 0003_rls.sql
-- RLS 헬퍼 함수 + 전 테이블 RLS 정책.
-- 원칙(설계문서 10.2 · CLAUDE.md 8·9절):
--  - 멘토는 배정된 케이스만, 멘티는 본인 케이스만
--  - 진흥원/넥스트랩(staff)은 전체 조회
--  - audit_logs, case_status_history, approvals 는 INSERT-only (UPDATE/DELETE 정책 없음)
--  - 쓰기(상태 전이 등)는 서버 Route Handler 에서 재검증 후 수행
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 헬퍼 함수 (SECURITY DEFINER — users/assignments 조회 시 RLS 재귀 방지)
-- ----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('institution', 'nextlab') and is_active
  );
$$;

create or replace function public.is_institution()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'institution' and is_active
  );
$$;

create or replace function public.is_nextlab()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'nextlab' and is_active
  );
$$;

create or replace function public.is_mentor_of(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mentor_assignments
    where case_id = target_case_id
      and mentor_id = auth.uid()
      and is_active
  );
$$;

create or replace function public.is_mentee_of(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cases
    where id = target_case_id and mentee_id = auth.uid()
  );
$$;

create or replace function public.can_access_case(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff()
      or public.is_mentor_of(target_case_id)
      or public.is_mentee_of(target_case_id);
$$;

-- ----------------------------------------------------------------------------
-- RLS 활성화
-- ----------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.support_types enable row level security;
alter table public.support_type_documents enable row level security;
alter table public.document_templates enable row level security;
alter table public.cases enable row level security;
alter table public.case_status_history enable row level security;
alter table public.mentor_assignments enable row level security;
alter table public.mentoring_logs enable row level security;
alter table public.signatures enable row level security;
alter table public.contractors enable row level security;
alter table public.documents enable row level security;
alter table public.support_applications enable row level security;
alter table public.reviews enable row level security;
alter table public.approvals enable row level security;
alter table public.payment_applications enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create policy users_select on public.users for select
  using (id = auth.uid() or public.is_staff());
-- 본인 프로필 일부 갱신(동의/비번변경 플래그)은 서버(service_role)에서 처리.
-- 계정 발급·수정은 service_role(admin) 클라이언트가 RLS 우회.

-- ----------------------------------------------------------------------------
-- support_types / support_type_documents / document_templates
-- 전체 조회, 관리자(staff)만 수정
-- ----------------------------------------------------------------------------
create policy support_types_select on public.support_types for select
  using (auth.uid() is not null);
create policy support_types_write on public.support_types for all
  using (public.is_staff()) with check (public.is_staff());

create policy support_type_documents_select on public.support_type_documents for select
  using (auth.uid() is not null);
create policy support_type_documents_write on public.support_type_documents for all
  using (public.is_staff()) with check (public.is_staff());

create policy document_templates_select on public.document_templates for select
  using (auth.uid() is not null);
create policy document_templates_write on public.document_templates for all
  using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- cases — 역할별 담당 케이스만
-- ----------------------------------------------------------------------------
create policy cases_select on public.cases for select
  using (
    public.is_staff()
    or mentee_id = auth.uid()
    or public.is_mentor_of(id)
  );
create policy cases_insert on public.cases for insert
  with check (public.is_staff());
create policy cases_update on public.cases for update
  using (public.is_staff() or public.is_mentor_of(id))
  with check (public.is_staff() or public.is_mentor_of(id));

-- ----------------------------------------------------------------------------
-- case_status_history — INSERT-only
-- ----------------------------------------------------------------------------
create policy case_status_history_select on public.case_status_history for select
  using (public.can_access_case(case_id));
create policy case_status_history_insert on public.case_status_history for insert
  with check (public.can_access_case(case_id));

-- ----------------------------------------------------------------------------
-- mentor_assignments
-- ----------------------------------------------------------------------------
create policy mentor_assignments_select on public.mentor_assignments for select
  using (public.is_staff() or mentor_id = auth.uid());
create policy mentor_assignments_write on public.mentor_assignments for all
  using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- mentoring_logs — 조회는 케이스 관련자, 작성/수정은 담당 멘토·staff
-- ----------------------------------------------------------------------------
create policy mentoring_logs_select on public.mentoring_logs for select
  using (public.can_access_case(case_id));
create policy mentoring_logs_insert on public.mentoring_logs for insert
  with check (public.is_mentor_of(case_id) or public.is_staff());
create policy mentoring_logs_update on public.mentoring_logs for update
  using (public.is_mentor_of(case_id) or public.is_staff())
  with check (public.is_mentor_of(case_id) or public.is_staff());

-- ----------------------------------------------------------------------------
-- signatures — 케이스 관련자
-- ----------------------------------------------------------------------------
create policy signatures_select on public.signatures for select
  using (public.can_access_case(case_id));
create policy signatures_insert on public.signatures for insert
  with check (public.can_access_case(case_id));

-- ----------------------------------------------------------------------------
-- contractors — 멘티·멘토·staff 작성
-- ----------------------------------------------------------------------------
create policy contractors_select on public.contractors for select
  using (public.can_access_case(case_id));
create policy contractors_write on public.contractors for all
  using (public.can_access_case(case_id))
  with check (public.can_access_case(case_id));

-- ----------------------------------------------------------------------------
-- documents — 케이스 관련자 업로드/조회
-- ----------------------------------------------------------------------------
create policy documents_select on public.documents for select
  using (public.can_access_case(case_id));
create policy documents_insert on public.documents for insert
  with check (public.can_access_case(case_id));

-- ----------------------------------------------------------------------------
-- support_applications — 멘토 작성, staff·관련자 조회
-- ----------------------------------------------------------------------------
create policy support_applications_select on public.support_applications for select
  using (public.can_access_case(case_id));
create policy support_applications_write on public.support_applications for all
  using (public.is_mentor_of(case_id) or public.is_staff())
  with check (public.is_mentor_of(case_id) or public.is_staff());

-- ----------------------------------------------------------------------------
-- reviews — 넥스트랩 작성, staff·관련자 조회
-- ----------------------------------------------------------------------------
create policy reviews_select on public.reviews for select
  using (public.can_access_case(case_id));
create policy reviews_insert on public.reviews for insert
  with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- approvals — 진흥원 INSERT only, 관련자 조회
-- ----------------------------------------------------------------------------
create policy approvals_select on public.approvals for select
  using (public.can_access_case(case_id));
create policy approvals_insert on public.approvals for insert
  with check (public.is_institution());

-- ----------------------------------------------------------------------------
-- payment_applications — 넥스트랩 작성, staff·관련자 조회
-- ----------------------------------------------------------------------------
create policy payment_applications_select on public.payment_applications for select
  using (public.can_access_case(case_id));
create policy payment_applications_write on public.payment_applications for all
  using (public.is_staff()) with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- notifications — 관리자만
-- ----------------------------------------------------------------------------
create policy notifications_select on public.notifications for select
  using (public.is_staff());
create policy notifications_insert on public.notifications for insert
  with check (public.is_staff());

-- ----------------------------------------------------------------------------
-- audit_logs — INSERT-only, 조회는 staff
-- ----------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select
  using (public.is_staff());
create policy audit_logs_insert on public.audit_logs for insert
  with check (auth.uid() is not null);
