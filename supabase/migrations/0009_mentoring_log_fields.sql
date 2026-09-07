-- ============================================================================
-- 0009_mentoring_log_fields.sql
-- 컨설팅 결과보고서 서식을 빈 칸 없이 채우기 위한 멘토링 일지 항목 확장.
-- 장소·주제·기업 애로사항·컨설팅 결과를 별도 컬럼으로 저장한다.
-- (content = 컨설팅 내용)
-- ============================================================================
alter table public.mentoring_logs
  add column if not exists place text,
  add column if not exists topic text,
  add column if not exists difficulties text,
  add column if not exists result text;
