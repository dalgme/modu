-- (2026-11-16) 한글(HWP·HWPX) 보고서 → 정품 한글 PDF 자동 변환 (운영사 PC 상주 프로그램)
--  - programs.converter_settings  = { enabled, times["HH:MM"] } (KST) — 점검 시각, 운영 설정 [한글 PDF 변환] 탭에서 바꾼다
--  - programs.converter_last_run_at / converter_run_requested_at — 정해진 시각 실행 여부·[지금 변환 요청]
--  - report_converters   = 변환 PC(연결 키 sha256 만 저장), 서비스롤 전용
--  - report_conversions  = 원본 문서별 변환 결과(PDF 경로) — 원본 storage_path 가 바뀌면(수정 업로드) 다시 변환 대상
alter table public.programs
  add column if not exists converter_settings jsonb not null default '{"enabled": true, "times": ["09:00", "12:00", "17:00"]}'::jsonb,
  add column if not exists converter_last_run_at timestamptz,
  add column if not exists converter_run_requested_at timestamptz;

create table if not exists public.report_converters (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_seen_at timestamptz,
  last_run_at timestamptz,
  last_result jsonb,
  agent_version text
);
create index if not exists report_converters_program_idx on public.report_converters(program_id);
alter table public.report_converters enable row level security;

create table if not exists public.report_conversions (
  source_doc_id uuid primary key references public.documents(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  source_path text not null,
  status text not null check (status in ('done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  pdf_path text,
  pdf_size bigint,
  converter_id uuid references public.report_converters(id) on delete set null,
  converted_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists report_conversions_program_idx on public.report_conversions(program_id);
alter table public.report_conversions enable row level security;

comment on table public.report_converters is '한글 PDF 변환 PC — 연결 키 해시만 저장. 서비스롤 전용(정책 없음).';
comment on table public.report_conversions is '한글 보고서 → 정품 한글 PDF 변환본. 원본 경로가 바뀌면 다시 변환. 서비스롤 전용.';
