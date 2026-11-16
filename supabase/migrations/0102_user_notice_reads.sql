-- (2026-11-16) 한 번만 보여 주는 안내 팝업의 "읽음" 기록 — 사용자 × 안내 키.
-- 첫 안내: 'mentor_pdf_only_upload' (멘토 보고서·관찰의견서 PDF 전용 업로드 규칙).
-- 서비스롤 경로에서만 읽고 쓴다(RLS on, 정책 없음).
create table if not exists public.user_notice_reads (
  user_id uuid not null references public.users(id) on delete cascade,
  notice_key text not null check (char_length(notice_key) between 1 and 80),
  program_id uuid references public.programs(id) on delete set null,
  read_at timestamptz not null default now(),
  primary key (user_id, notice_key)
);
alter table public.user_notice_reads enable row level security;
comment on table public.user_notice_reads is '한 번만 보여 주는 안내 팝업 읽음 기록 (서비스롤 전용)';
