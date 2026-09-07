-- ============================================================================
-- 0052_documents_singleton_v2.sql  (docs/MODU-DESIGN.md §5)
-- 단일본 doc_key 유니크 인덱스를 모두의창업 키로 교체 (0045 대체).
--   단일본: observation_report(관찰의견서), satisfaction_survey_pdf
--   회차당 1건: mentoring_report:{logId}
--   그룹 필수서류 중 단일: req1:{key}
--   누적(제약 없음): mentoring_photo:{logId}, req:{key}, settlement_statement, application_pdf
-- ============================================================================

drop index if exists public.documents_singleton_doc_key_idx;

create unique index documents_singleton_doc_key_idx
  on public.documents (case_id, doc_key)
  where doc_key in ('observation_report', 'satisfaction_survey_pdf')
     or starts_with(doc_key, 'mentoring_report:')
     or starts_with(doc_key, 'req1:');

-- documents.doc_key 는 이제 필수 (원본은 nullable)
alter table public.documents alter column doc_key set not null;
