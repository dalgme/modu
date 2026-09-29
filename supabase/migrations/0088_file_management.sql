-- 0088 파일 관리 (2026-09-30)
-- ① 행사 파일 보안 정책 — business_plan_download(멘티 사업계획서·참고파일을 멘토가 내려받기/인쇄 허용, 기본 false = 미리보기만)
-- ② 멘토 지급증빙 서류(2~4종 자유 파일) — 행사 단위(라운드 공통), 운영사가 [파일 관리 > 멘토 지급서류]에서 일괄 등록
-- ③ 관찰의견서 웹 작성 폐지 → observation_reports 는 임시 필드로 보존(추후 필드 추가 시 재활용)
-- 멘티 사업계획서는 새 테이블 없이 documents 에 doc_key 'business_plan' / 참고파일 'business_ref' (누적, 유니크 없음)

alter table public.programs
  add column if not exists file_policy jsonb not null default '{}'::jsonb;

comment on column public.programs.file_policy is
  '파일 보안 정책(행사별). business_plan_download: 멘토의 멘티 사업계획서·참고파일 다운로드/인쇄 허용(기본 false = 웹 미리보기만).';

create table if not exists public.mentor_payment_files (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  mentor_id uuid not null references public.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size bigint,
  sha256 text,
  sort_order integer not null default 0,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentor_payment_files_program_mentor_idx
  on public.mentor_payment_files (program_id, mentor_id, sort_order);

-- 서비스롤 전용(앱 서버 코드에서 권한 확인) — 정책 없음 = anon/authenticated 접근 불가
alter table public.mentor_payment_files enable row level security;

comment on table public.mentor_payment_files is
  '멘토 지급증빙 서류(이력서·통장사본·신분증사본 등 2~4종 자유 파일). 행사 단위 — 모든 라운드(그룹)에서 공통 사용. 저장 경로 documents 버킷 mentor-payment/{program_id}/{mentor_id}/.';

comment on table public.observation_reports is
  '임시 필드(2026-09-30): 관찰의견서 웹 작성 폐지 — 제출은 파일 업로드(documents.observation_report)만. content 는 추후 필드 추가 시 재활용하기 위해 보존.';
