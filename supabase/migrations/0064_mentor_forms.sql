-- 0064 (2026-09-09) P13 — 책임멘토 위촉 서식 4종 (위촉 동의서 · 개인정보 수집·이용 동의서 · 서약서 · 사전 확인서)
--  - mentor_form_settings: 행사별 서식 사용 여부·수령 방식(web/file)·제목·본문(운영사 편집, 표준 양식 기본값은 코드).
--  - mentor_form_submissions: 멘토별 제출 1건 (웹작성 = 본문 스냅샷 + 응답 jsonb, 파일 = 스토리지 경로).
--    주민등록번호 등 고유식별정보는 answers 에 넣지 않고 rrn_sealed(SMS_KEK 봉투암호화)로만 저장한다.

create table public.mentor_form_settings (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  form_key text not null check (form_key in ('appointment', 'privacy', 'pledge', 'precheck')),
  enabled boolean not null default false,
  method text not null default 'web' check (method in ('web', 'file')),
  title text not null,
  content text not null,
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (program_id, form_key)
);

create table public.mentor_form_submissions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  form_key text not null check (form_key in ('appointment', 'privacy', 'pledge', 'precheck')),
  user_id uuid not null references public.users (id) on delete cascade,
  method text not null check (method in ('web', 'file')),
  content_snapshot text,                       -- 웹작성: 동의 당시 본문
  answers jsonb not null default '{}'::jsonb,  -- 웹작성: 필드·동의 응답 (고유식별정보 제외)
  rrn_sealed text,                             -- 위촉 동의서 주민등록번호 (봉투암호화, 열람은 민감정보 권한)
  signed_name text,                            -- 전자서명(성명 입력)
  file_path text,                              -- 파일 제출: documents 버킷 경로
  file_name text,
  submitted_at timestamptz not null default now(),
  unique (program_id, form_key, user_id)
);
create index mentor_form_submissions_program_idx on public.mentor_form_submissions (program_id, form_key);

alter table public.mentor_form_settings enable row level security;
alter table public.mentor_form_submissions enable row level security;
create policy mentor_form_settings_select on public.mentor_form_settings for select
  using (private.is_program_staff(program_id) or private.program_role(program_id) = 'mentor');
create policy mentor_form_submissions_select on public.mentor_form_submissions for select
  using (user_id = auth.uid() or private.is_program_staff(program_id));
-- 쓰기는 service_role(서버 액션)만
