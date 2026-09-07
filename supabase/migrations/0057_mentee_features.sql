-- ============================================================================
-- 0057_mentee_features.sql  (docs/MODU-DESIGN.md §7 — P5 멘티 기능)
-- 회차 서명을 회차 행에 연결(signatures.log_id), 멘티 1인 회차당 서명 1건.
-- ============================================================================

alter table public.signatures
  add column log_id uuid references public.mentoring_logs (id) on delete cascade;
create unique index signatures_log_signer_key on public.signatures (log_id, signer_type) where log_id is not null;
create index signatures_log_idx on public.signatures (log_id) where log_id is not null;
