-- 스토리지 버킷 3종 (모두 비공개 · signed URL 로만 접근)
-- documents  : 서류 (계약서·증빙 등)
-- signatures : 서명 PNG (멘토·멘티·업체)
-- photos     : 멘토링 방문 사진
--
-- 비공개 버킷이므로 접근은 반드시 signed URL 로만 발급한다.
-- 파일별 RLS(케이스 소유자·담당 멘토·운영자만 접근)는 스키마 마이그레이션에서
-- storage.objects 정책으로 별도 정의한다.

insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', false),
  ('signatures', 'signatures', false),
  ('photos', 'photos', false)
on conflict (id) do nothing;
