-- 0069 (2026-09-21) P20 — 멘토 지급서류(이력서·통장사본·신분증사본) 파일 제출(업로드)
--  기존 mentor_payment_docs(수령 체크)에 멘토 본인이 올린 파일 경로를 추가한다.
--  수령 체크(운영사 확인)와 제출(멘토 업로드)은 별개 상태로 함께 표시한다.

alter table public.mentor_payment_docs
  add column resume_path text,
  add column resume_file_name text,
  add column resume_uploaded_at timestamptz,
  add column bankbook_path text,
  add column bankbook_file_name text,
  add column bankbook_uploaded_at timestamptz,
  add column id_card_path text,
  add column id_card_file_name text,
  add column id_card_uploaded_at timestamptz;

-- 멘토 본인 열람 허용 (기존 select 는 행사 스태프만)
create policy mentor_payment_docs_select_self on public.mentor_payment_docs for select
  using (user_id = auth.uid());
