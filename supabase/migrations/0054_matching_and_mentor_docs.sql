-- ============================================================================
-- 0054_matching_and_mentor_docs.sql  (docs/MODU-DESIGN.md §14, §15)
-- 키워드 사전, 멘토/멘티 다중 키워드 프로필, AI 매칭 추천(객관 요인 + 정성 근거 기록),
-- 멘토 지급서류 수령 체크(이력서·통장사본·신분증사본 — 파일은 보관하지 않음).
-- ============================================================================

-- 1) 키워드 사전 (행사별)
create table public.tag_catalog (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  category text not null check (category in ('industry', 'expertise', 'stage', 'region', 'need', 'custom')),
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (program_id, category, label)
);

-- 2) 멘토 프로필 (행사별 — 같은 멘토라도 행사마다 전문분야·수용량이 다를 수 있다)
create table public.mentor_profiles (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  industries text[] not null default '{}',
  expertise text[] not null default '{}',
  regions text[] not null default '{}',
  stages text[] not null default '{}',
  modes public.consulting_mode[] not null default '{online,offline}',
  capacity integer not null default 5 check (capacity between 0 and 100),
  career text,
  bio text,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, user_id)
);
create trigger mentor_profiles_set_updated_at before update on public.mentor_profiles
  for each row execute function public.set_updated_at();

-- 3) 멘티 프로필 (케이스 단위 — 그룹 승계 시 새 케이스에 복사)
create table public.mentee_profiles (
  case_id uuid primary key references public.cases (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  industry text,
  stage text,
  region text,
  preferred_mode public.consulting_mode,
  needs text[] not null default '{}',
  keywords text[] not null default '{}',
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger mentee_profiles_set_updated_at before update on public.mentee_profiles
  for each row execute function public.set_updated_at();

-- 4) 매칭 추천 기록 (자동 배정 없음 — 배정은 렛츠 클릭)
create table public.match_recommendations (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  mentor_id uuid not null references public.users (id) on delete cascade,
  rank integer not null check (rank >= 1),
  score numeric(5, 2) not null check (score between 0 and 100),
  objective jsonb not null,                    -- 태그 겹침·지역·유형·부하 등 재현 가능한 수치
  rationale text,                              -- 모델 정성 근거 (없으면 객관 점수만)
  model text,                                  -- 예: claude-opus-5
  prompt_version text,
  generated_at timestamptz not null default now(),
  generated_by uuid references public.users (id) on delete set null,
  adopted_at timestamptz                       -- 이 추천으로 실제 배정된 시각
);
create index match_recommendations_case_idx on public.match_recommendations (case_id, generated_at desc);

-- 5) 멘토 지급서류 수령 체크 (행사별) — 저장 액션은 비밀번호 재인증 필수 (앱 계층)
create table public.mentor_payment_docs (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  resume_received_at timestamptz,
  bankbook_received_at timestamptz,
  id_card_received_at timestamptz,
  note text,
  checked_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, user_id)
);
create trigger mentor_payment_docs_set_updated_at before update on public.mentor_payment_docs
  for each row execute function public.set_updated_at();

-- 6) RLS
alter table public.tag_catalog enable row level security;
create policy tag_catalog_select on public.tag_catalog for select
  using (private.is_program_member(program_id) or private.is_platform_admin());
create policy tag_catalog_write on public.tag_catalog for all
  using (private.is_program_nextlab(program_id)) with check (private.is_program_nextlab(program_id));

alter table public.mentor_profiles enable row level security;
create policy mentor_profiles_select on public.mentor_profiles for select
  using (user_id = auth.uid() or private.is_program_staff(program_id));
create policy mentor_profiles_write on public.mentor_profiles for all
  using (user_id = auth.uid() or private.is_program_nextlab(program_id))
  with check (user_id = auth.uid() or private.is_program_nextlab(program_id));

alter table public.mentee_profiles enable row level security;
create policy mentee_profiles_select on public.mentee_profiles for select
  using (private.can_access_case(case_id));
create policy mentee_profiles_write on public.mentee_profiles for all
  using (private.is_mentee_of(case_id) or private.is_program_nextlab(program_id))
  with check (private.is_mentee_of(case_id) or private.is_program_nextlab(program_id));

alter table public.match_recommendations enable row level security;
create policy match_recommendations_select on public.match_recommendations for select
  using (private.is_program_staff(program_id));
create policy match_recommendations_write on public.match_recommendations for all
  using (private.is_program_nextlab(program_id)) with check (private.is_program_nextlab(program_id));

alter table public.mentor_payment_docs enable row level security;
create policy mentor_payment_docs_select on public.mentor_payment_docs for select
  using (private.is_program_staff(program_id));
create policy mentor_payment_docs_write on public.mentor_payment_docs for all
  using (private.is_program_nextlab(program_id)) with check (private.is_program_nextlab(program_id));
