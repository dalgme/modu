-- 케이스당 1건만 존재해야 하는 서류(doc_key)의 중복을 DB 차원에서 원천 차단한다.
--
-- 배경:
--   documents 에는 '교체(replace)' 의미의 doc_key 와 '누적(append)' 의미의 doc_key 가 섞여 있는데,
--   교체 보장이 각 호출부의 delete-then-insert 코드에만 의존해 왔다. 그 결과
--     - 교체 로직이 늦게 추가된 키(consulting_report: 2026-08-20 PR #149)는 그 이전 생성분이 누적되고
--     - 교체 로직을 빠뜨린 키(application_pdf)는 재등록마다 쌓이며
--     - delete 와 insert 사이에 경합이 나면 중복이 생길 수 있었다.
--   실제로 타임노래연습장은 컨설팅 결과보고서가 5건까지 쌓였다.
--
-- 조치:
--   (1) 기존 중복 정리 — (case_id, doc_key) 별 최신 1건만 남긴다.
--   (2) 부분 유니크 인덱스로 재발을 구조적으로 차단한다.
--
-- 대상(교체 의미):
--   consulting_report    컨설팅 결과보고서(병합 생성본 또는 업로드 완성본)
--   support_application  웹 작성 지원신청서
--   form_*               붙임서식 생성본 (같은 서식은 항상 최신본으로 교체)
--
-- 비대상(누적 의미 — 제약을 걸면 안 됨):
--   mentoring_report, mentoring_photo(:logId), contractor_*, si:*, payment_*,
--   applicant_biz_reg, pledge_no_overlap_file, support_application_file, application_pdf
--
-- application_pdf 를 제외하는 이유(운영 방침, 2026-09-03 확정):
--   신청서 원본 PDF 는 진흥원의 '제출 이력'이라 재등록 시에도 이전 제출본을 보존한다.
--   중복이 있어도 화면은 흔들리지 않는다 — 열람(getApplicationSourcePdfUrl)은 created_at desc + limit 1 로
--   항상 최신본을 쓰고, 목록/상세는 존재 여부(hasApplicationPdf)만 참조한다.
--   따라서 이 키에 유니크 제약이나 교체(delete) 로직을 넣지 말 것.

-- (1) 중복 정리: 최신 1건만 유지
--     스토리지 오브젝트는 storage.protect_delete() 트리거로 SQL 직접 삭제가 금지돼 있어
--     여기서는 documents 행만 제거한다. 남는 blob 은 어느 화면에서도 참조되지 않는 고아 파일이며,
--     필요하면 Storage API 로 별도 정리한다.
with ranked as (
  select id,
         row_number() over (
           partition by case_id, doc_key
           order by created_at desc, id desc
         ) as rn
  from public.documents
  where doc_key in ('consulting_report', 'support_application')
     or starts_with(doc_key, 'form_')
)
delete from public.documents where id in (select id from ranked where rn > 1);

-- (2) 재발 차단: 케이스당 1건 강제
create unique index if not exists documents_singleton_doc_key_idx
  on public.documents (case_id, doc_key)
  where doc_key in ('consulting_report', 'support_application')
     or starts_with(doc_key, 'form_');
