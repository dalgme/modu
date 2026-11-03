-- 0097 (2026-11-03)
-- ① 테스트 계정 완전 삭제의 안전장치 — 지우기 전에 연결 데이터 전부(행 JSON)와 파일 이동 경로를 보관하고, 여기서 복원한다.
create table if not exists public.deletion_archives (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  kind text not null default 'test_mentee',
  label text not null,
  target_user_id uuid not null,
  summary jsonb not null default '{}'::jsonb,
  payload jsonb not null,
  storage_moves jsonb not null default '[]'::jsonb,
  reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references public.users(id) on delete set null,
  restore_result jsonb
);
create index if not exists deletion_archives_program_idx on public.deletion_archives(program_id, created_at desc);
alter table public.deletion_archives enable row level security; -- 서비스롤 전용

-- ② 라운드(사업그룹)별 설문조사(만족도) 사용 여부 — 기본 사용
alter table public.support_types add column if not exists survey_enabled boolean not null default true;
comment on column public.support_types.survey_enabled is '라운드별 만족도 설문 사용 여부 — false 면 자동 개시·멘티 노출·독려 문자·[만족도 생성]·그룹 대상 조사 개설이 꺼진다';
