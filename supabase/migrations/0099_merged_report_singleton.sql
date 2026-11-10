-- 0099 멘티별 회차 보고서 합본 PDF (2026-11-10) — 케이스당 1건 강제 (CLAUDE.md §6-8 단일본 규칙)
-- 앱은 기존 행을 갱신하고 남은 중복을 정리하지만(merged-report.ts), 동시에 두 번 저장할 때를 대비해 DB 에서도 막는다.
-- 이 인덱스가 없어도 기능은 동작한다(앱이 마지막 1건만 쓰고 정리).
create unique index if not exists documents_merged_report_one_per_case_idx
  on public.documents (case_id)
  where doc_key = 'mentoring_report_merged';
