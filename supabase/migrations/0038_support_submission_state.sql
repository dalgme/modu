-- 지원신청(사전)·자금신청(사후) '제출 완료' 상태 타임스탬프.
-- 멘티가 서류를 다 올린 뒤 '제출하기'를 누르면 기록되며, 제출 완료 배지 표시에 사용한다.
-- (워크플로우 상태 전이 log_completed→contractor_registered / notified→execution_docs_submitted 와 함께 갱신)

alter table public.cases
  add column if not exists pre_support_submitted_at timestamptz,
  add column if not exists post_support_submitted_at timestamptz;
