-- ============================================================================
-- 0051_requests_surveys_reviews.sql  (docs/MODU-DESIGN.md §7, §20)
-- 멘티 멘토 변경 요청, 만족도 조사(그룹별 표준양식·문항 유형 5종·응답), 그룹별 멘토 운영사 평가·메모,
-- reviews 를 종결 검수 기록으로 재사용(support_application 참조 제거).
-- ============================================================================

-- 1) 멘티 → 멘토 변경 요청
create table public.mentor_change_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  requested_by uuid not null references public.users (id) on delete restrict,   -- 멘티
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  handled_by uuid references public.users (id) on delete set null,
  handled_at timestamptz,
  handling_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mentor_change_requests_case_idx on public.mentor_change_requests (case_id, status);
create trigger mentor_change_requests_set_updated_at before update on public.mentor_change_requests
  for each row execute function public.set_updated_at();

-- 2) 만족도 조사 — 템플릿(행사 공통 or 그룹 지정) / 문항 / 응답
create table public.survey_templates (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  support_type_id uuid references public.support_types (id) on delete cascade,   -- null = 행사 공통 양식
  name text not null,
  version integer not null default 1 check (version >= 1),
  is_active boolean not null default true,
  locked_at timestamptz,                       -- 응답이 1건이라도 생기면 잠금 (수정은 새 버전)
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index survey_templates_scope_version_key
  on public.survey_templates (program_id, coalesce(support_type_id, '00000000-0000-0000-0000-000000000000'::uuid), version);
create trigger survey_templates_set_updated_at before update on public.survey_templates
  for each row execute function public.set_updated_at();

create table public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.survey_templates (id) on delete cascade,
  sort_order integer not null default 0,
  qtype text not null check (qtype in ('scale', 'single', 'multi', 'text', 'rank')),
  label text not null,
  help text,
  options jsonb,                               -- single/multi/rank: 보기 목록 · scale: {min,max,min_label,max_label}
  required boolean not null default true,
  created_at timestamptz not null default now()
);
create index survey_questions_template_idx on public.survey_questions (template_id, sort_order);

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases (id) on delete cascade,
  template_id uuid not null references public.survey_templates (id) on delete restrict,
  mentee_id uuid not null references public.users (id) on delete restrict,
  answers jsonb not null,                      -- { questionId: value | value[] | rankedOptionIds[] | text }
  score numeric(4, 2),                         -- scale 문항 평균 (대시보드용 파생값)
  submitted_at timestamptz not null default now()
);

-- 응답이 생기면 템플릿 잠금
create or replace function private.lock_survey_template()
returns trigger language plpgsql set search_path = public as $$
begin
  update public.survey_templates set locked_at = coalesce(locked_at, now()) where id = new.template_id;
  return new;
end;
$$;
create trigger survey_responses_lock_template after insert on public.survey_responses
  for each row execute function private.lock_survey_template();

-- 3) 그룹별 멘토 운영사 평가·메모 (그룹 귀속 · append-only · soft delete)
create table public.mentor_group_reviews (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  support_type_id uuid not null references public.support_types (id) on delete cascade,
  mentor_id uuid not null references public.users (id) on delete cascade,
  author_id uuid not null references public.users (id) on delete restrict,
  rating smallint check (rating between 1 and 5),
  memo text,
  tags text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (rating is not null or memo is not null)
);
create index mentor_group_reviews_mentor_idx on public.mentor_group_reviews (mentor_id, created_at desc);
create index mentor_group_reviews_group_idx on public.mentor_group_reviews (support_type_id, mentor_id) where deleted_at is null;

-- 4) reviews → 종결 검수 기록으로 재사용
alter table public.reviews drop column if exists support_application_id;
alter table public.reviews
  add column kind text not null default 'closure' check (kind in ('closure', 'partial')),
  add column settlement_id uuid references public.settlements (id) on delete set null;

-- 5) RLS
alter table public.mentor_change_requests enable row level security;
create policy mentor_change_requests_select on public.mentor_change_requests for select
  using (requested_by = auth.uid() or private.is_program_staff(private.case_program(case_id)));
create policy mentor_change_requests_insert on public.mentor_change_requests for insert
  with check (requested_by = auth.uid() and private.is_mentee_of(case_id));
create policy mentor_change_requests_update on public.mentor_change_requests for update
  using (private.is_program_nextlab(private.case_program(case_id)))
  with check (private.is_program_nextlab(private.case_program(case_id)));

alter table public.survey_templates enable row level security;
create policy survey_templates_select on public.survey_templates for select
  using (private.is_program_member(program_id) or private.is_platform_admin());
create policy survey_templates_write on public.survey_templates for all
  using (private.is_program_nextlab(program_id)) with check (private.is_program_nextlab(program_id));

alter table public.survey_questions enable row level security;
create policy survey_questions_select on public.survey_questions for select
  using (exists (select 1 from public.survey_templates t where t.id = template_id
                 and (private.is_program_member(t.program_id) or private.is_platform_admin())));
create policy survey_questions_write on public.survey_questions for all
  using (exists (select 1 from public.survey_templates t where t.id = template_id and private.is_program_nextlab(t.program_id)))
  with check (exists (select 1 from public.survey_templates t where t.id = template_id and private.is_program_nextlab(t.program_id)));

alter table public.survey_responses enable row level security;
create policy survey_responses_select on public.survey_responses for select
  using (mentee_id = auth.uid() or private.is_program_staff(private.case_program(case_id)));
create policy survey_responses_insert on public.survey_responses for insert
  with check (mentee_id = auth.uid() and private.is_mentee_of(case_id));

alter table public.mentor_group_reviews enable row level security;
-- 멘토 본인에게는 비공개. 열람·작성은 그 행사의 스태프.
create policy mentor_group_reviews_select on public.mentor_group_reviews for select
  using (private.is_program_staff(program_id));
create policy mentor_group_reviews_write on public.mentor_group_reviews for all
  using (private.is_program_nextlab(program_id)) with check (private.is_program_nextlab(program_id));

drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert
  with check (private.is_program_nextlab(private.case_program(case_id)));
