-- ============================================================================
-- 0053_drop_legacy_and_program_scope.sql  (docs/MODU-DESIGN.md §5-2, §10-1, §16)
-- 보조금 절차 전용 테이블·타입 삭제, app_settings 행사 범위화, document_templates·notifications 행사 소속,
-- 스태프 전역 정책(notifications·audit_logs)을 행사 범위로.
-- ============================================================================

-- 1) 레거시 테이블 (재기지원 보조금 절차) 삭제 — 새 DB 라 데이터 없음
drop table if exists public.payment_applications cascade;
drop table if exists public.approvals cascade;
drop table if exists public.support_applications cascade;
drop table if exists public.contractors cascade;
drop table if exists public.case_edit_grants cascade;
drop type if exists public.approval_type;
drop type if exists public.approval_result;

-- 2) app_settings: key 전역 PK → (key, program_id) 범위. program_id null = 플랫폼 공통.
alter table public.app_settings add column id uuid not null default gen_random_uuid();
alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add primary key (id);
alter table public.app_settings add column program_id uuid references public.programs (id) on delete cascade;
create unique index app_settings_key_program_key
  on public.app_settings (key, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop policy if exists app_settings_select on public.app_settings;
drop policy if exists app_settings_write_nextlab on public.app_settings;
create policy app_settings_select on public.app_settings for select
  using ((program_id is null and (private.is_staff() or private.is_platform_admin()))
         or (program_id is not null and private.is_program_staff(program_id)));
create policy app_settings_write on public.app_settings for all
  using ((program_id is null and private.is_platform_admin())
         or (program_id is not null and private.is_program_nextlab(program_id)))
  with check ((program_id is null and private.is_platform_admin())
              or (program_id is not null and private.is_program_nextlab(program_id)));

-- 3) 서식: 행사별 override (null = 플랫폼 공통)
alter table public.document_templates
  add column program_id uuid references public.programs (id) on delete cascade;
alter table public.document_templates drop constraint if exists document_templates_template_key_key;
create unique index document_templates_key_program_key
  on public.document_templates (template_key, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- 4) 케이스 없는 알림(품의·설정 등)도 행사에 묶는다
alter table public.notifications
  add column program_id uuid references public.programs (id) on delete cascade;
create index notifications_program_idx on public.notifications (program_id, status);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select
  using (recipient_id = auth.uid()
         or (program_id is not null and private.is_program_staff(program_id))
         or (case_id is not null and private.is_program_staff(private.case_program(case_id))));
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert
  with check ((program_id is not null and private.is_program_staff(program_id))
              or (case_id is not null and private.is_program_staff(private.case_program(case_id))));

-- 5) 감사로그: 행사 축 추가 (리포트 §19-2 '감사' + 멘토 통합 로그 §20)
alter table public.audit_logs
  add column program_id uuid references public.programs (id) on delete set null;
create index audit_logs_program_idx on public.audit_logs (program_id, created_at desc);
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select
  using (private.is_platform_admin()
         or (program_id is not null and private.is_program_staff(program_id))
         or (program_id is null and private.is_staff()));

-- 6) 보완요청·운영요청·게시판은 케이스/작성자 기준 정책이라 그대로 둔다.
--    supplement_requests.phase 의 pre/post 값은 사용하지 않지만 제약을 유지해도 무해하다.
