-- ============================================================================
-- 0005_harden_helpers.sql
-- 보안 어드바이저 대응:
--  (1) RLS 헬퍼 함수를 비노출 스키마 private 로 이전 → PostgREST RPC 노출 제거
--      (lint 0028/0029: anon·authenticated 가 /rest/v1/rpc/* 로 호출 가능하던 문제)
--  (2) set_updated_at 의 mutable search_path 고정 (lint 0011)
-- private 스키마는 PostgREST 노출 스키마 목록에 없으므로 RPC 엔드포인트가 생기지 않는다.
-- RLS 정책은 함수 본문을 직접 호출하므로 정상 동작한다.
-- ============================================================================

create schema if not exists private;

-- private 헬퍼 함수 (public 사본과 동일 로직)
create or replace function private.current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users
    where id = auth.uid() and role in ('institution','nextlab') and is_active);
$$;

create or replace function private.is_institution()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users
    where id = auth.uid() and role = 'institution' and is_active);
$$;

create or replace function private.is_nextlab()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users
    where id = auth.uid() and role = 'nextlab' and is_active);
$$;

create or replace function private.is_mentor_of(target_case_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mentor_assignments
    where case_id = target_case_id and mentor_id = auth.uid() and is_active);
$$;

create or replace function private.is_mentee_of(target_case_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cases
    where id = target_case_id and mentee_id = auth.uid());
$$;

create or replace function private.can_access_case(target_case_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_staff() or private.is_mentor_of(target_case_id) or private.is_mentee_of(target_case_id);
$$;

-- 헬퍼를 참조하는 정책 재생성 (public.* → private.*)
drop policy if exists users_select on public.users;
create policy users_select on public.users for select
  using (id = auth.uid() or private.is_staff());

drop policy if exists support_types_write on public.support_types;
create policy support_types_write on public.support_types for all
  using (private.is_staff()) with check (private.is_staff());

drop policy if exists support_type_documents_write on public.support_type_documents;
create policy support_type_documents_write on public.support_type_documents for all
  using (private.is_staff()) with check (private.is_staff());

drop policy if exists document_templates_write on public.document_templates;
create policy document_templates_write on public.document_templates for all
  using (private.is_staff()) with check (private.is_staff());

drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select
  using (private.is_staff() or mentee_id = auth.uid() or private.is_mentor_of(id));
drop policy if exists cases_insert on public.cases;
create policy cases_insert on public.cases for insert
  with check (private.is_staff());
drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases for update
  using (private.is_staff() or private.is_mentor_of(id))
  with check (private.is_staff() or private.is_mentor_of(id));

drop policy if exists case_status_history_select on public.case_status_history;
create policy case_status_history_select on public.case_status_history for select
  using (private.can_access_case(case_id));
drop policy if exists case_status_history_insert on public.case_status_history;
create policy case_status_history_insert on public.case_status_history for insert
  with check (private.can_access_case(case_id));

drop policy if exists mentor_assignments_select on public.mentor_assignments;
create policy mentor_assignments_select on public.mentor_assignments for select
  using (private.is_staff() or mentor_id = auth.uid());
drop policy if exists mentor_assignments_write on public.mentor_assignments;
create policy mentor_assignments_write on public.mentor_assignments for all
  using (private.is_staff()) with check (private.is_staff());

drop policy if exists mentoring_logs_select on public.mentoring_logs;
create policy mentoring_logs_select on public.mentoring_logs for select
  using (private.can_access_case(case_id));
drop policy if exists mentoring_logs_insert on public.mentoring_logs;
create policy mentoring_logs_insert on public.mentoring_logs for insert
  with check (private.is_mentor_of(case_id) or private.is_staff());
drop policy if exists mentoring_logs_update on public.mentoring_logs;
create policy mentoring_logs_update on public.mentoring_logs for update
  using (private.is_mentor_of(case_id) or private.is_staff())
  with check (private.is_mentor_of(case_id) or private.is_staff());

drop policy if exists signatures_select on public.signatures;
create policy signatures_select on public.signatures for select
  using (private.can_access_case(case_id));
drop policy if exists signatures_insert on public.signatures;
create policy signatures_insert on public.signatures for insert
  with check (private.can_access_case(case_id));

drop policy if exists contractors_select on public.contractors;
create policy contractors_select on public.contractors for select
  using (private.can_access_case(case_id));
drop policy if exists contractors_write on public.contractors;
create policy contractors_write on public.contractors for all
  using (private.can_access_case(case_id)) with check (private.can_access_case(case_id));

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select
  using (private.can_access_case(case_id));
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert
  with check (private.can_access_case(case_id));

drop policy if exists support_applications_select on public.support_applications;
create policy support_applications_select on public.support_applications for select
  using (private.can_access_case(case_id));
drop policy if exists support_applications_write on public.support_applications;
create policy support_applications_write on public.support_applications for all
  using (private.is_mentor_of(case_id) or private.is_staff())
  with check (private.is_mentor_of(case_id) or private.is_staff());

drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews for select
  using (private.can_access_case(case_id));
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert
  with check (private.is_staff());

drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select
  using (private.can_access_case(case_id));
drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals for insert
  with check (private.is_institution());

drop policy if exists payment_applications_select on public.payment_applications;
create policy payment_applications_select on public.payment_applications for select
  using (private.can_access_case(case_id));
drop policy if exists payment_applications_write on public.payment_applications;
create policy payment_applications_write on public.payment_applications for all
  using (private.is_staff()) with check (private.is_staff());

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (private.is_staff());
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert
  with check (private.is_staff());

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select
  using (private.is_staff());

-- 이제 public 헬퍼 함수 제거 (더 이상 참조 없음)
drop function if exists public.can_access_case(uuid);
drop function if exists public.is_mentor_of(uuid);
drop function if exists public.is_mentee_of(uuid);
drop function if exists public.is_staff();
drop function if exists public.is_institution();
drop function if exists public.is_nextlab();
drop function if exists public.current_user_role();

-- set_updated_at search_path 고정
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
