-- 0081 (2026-09-24) P30 — 승계 필수서류 복사 출처 · 회차 정정 표시 · 승계 조회 인덱스
-- 1) documents.copied_from_case_id: 승계 개설 시 이전 케이스의 필수서류(req:/req1:)를 새 케이스 폴더로 복사한 행의 출처.
--    스토리지 객체는 새 케이스 경로(`{caseId}/…`)로 복사한다(케이스 범위 signed URL 규칙 유지). 원본 케이스 삭제 시 null.
alter table public.documents
  add column if not exists copied_from_case_id uuid null references public.cases(id) on delete set null;

-- 2) mentoring_logs.corrected_at: 운영사 회차 정정(일시·방법·장소) 시각 — 상세 이력은 audit_logs 'round.corrected'.
alter table public.mentoring_logs
  add column if not exists corrected_at timestamptz null;

-- 3) 승계 다음 단계(successor) 조회
create index if not exists cases_predecessor_case_id_idx on public.cases (predecessor_case_id) where predecessor_case_id is not null;
