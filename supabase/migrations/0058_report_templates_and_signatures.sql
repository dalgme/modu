-- ============================================================================
-- 0058_report_templates_and_signatures.sql  (P6 · 2026-09-07 추가 요건)
-- 컨설팅 보고서 양식을 행사/그룹 단위로 등록, 서명 정책(멘티 확인 서명 · 멘토 자동 서명),
-- 멘토 서명 등록본. 정책은 양식에 멘토 서명 컬럼({{{sign_mentor}}})이 있을 때만 켤 수 있다(앱 검증).
-- ============================================================================

-- 1) 서식: (template_key, 행사, 그룹) 범위 — 그룹 override
drop index if exists public.document_templates_key_program_key;
create unique index document_templates_key_scope_key
  on public.document_templates (
    template_key,
    coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(support_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
alter table public.document_templates
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_by uuid references public.users (id) on delete set null;

-- 2) 회차 보고서 서명 정책 (행사 기본 + 그룹 override, null = 행사 기본)
alter table public.programs
  add column round_report_policy jsonb not null default '{"mentee_confirm_signature": true, "mentor_auto_sign": false}'::jsonb;
alter table public.support_types
  add column round_report_policy jsonb;

-- 3) 멘토 서명 등록본 (사용자 단위, 케이스와 무관)
create table public.mentor_signatures (
  user_id uuid primary key references public.users (id) on delete cascade,
  storage_path text not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger mentor_signatures_set_updated_at before update on public.mentor_signatures
  for each row execute function public.set_updated_at();
alter table public.mentor_signatures enable row level security;
create policy mentor_signatures_select on public.mentor_signatures for select
  using (user_id = auth.uid() or private.shares_program_with(user_id));
-- 쓰기는 서비스롤 경로(서버 액션)만.
