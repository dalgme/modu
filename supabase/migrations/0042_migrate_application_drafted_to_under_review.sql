-- 의미 재정의에 따른 기존 데이터 이관.
-- 구(舊) application_drafted = '송신 완료, 넥스트랩 검수 대기' → 신(新) under_review 로 이관.
-- 신(新) application_drafted = '컨설팅 결과보고서 생성 후 지원신청서 작성·접수(송신 전)'.
do $$
declare
  rid uuid;
begin
  for rid in select id from cases where status = 'application_drafted' loop
    update cases set status = 'under_review' where id = rid;
    insert into case_status_history (case_id, from_status, to_status, changed_by, note)
    values (rid, 'application_drafted', 'under_review', null,
            '프로세스 개선: 검수 대기 상태를 under_review 로 이관');
  end loop;
end $$;
