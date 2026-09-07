-- 프로세스 개선 반영(소급): 컨설팅 결과보고서가 이미 생성된 log_completed 케이스를
-- application_drafted(지원신청서 작성·접수)로 이관한다. (신 프로세스: 보고서 생성 = 작성·접수 진입)
-- 보고서가 없는 케이스(예: 아직 일지만 완료)는 그대로 log_completed 로 둔다.
do $$
declare
  rid uuid;
begin
  for rid in
    select c.id from cases c
    where c.status = 'log_completed'
      and exists (
        select 1 from documents d
        where d.case_id = c.id and d.doc_key = 'consulting_report'
      )
  loop
    update cases set status = 'application_drafted' where id = rid;
    insert into case_status_history (case_id, from_status, to_status, changed_by, note)
    values (rid, 'log_completed', 'application_drafted', null,
            '프로세스 개선(소급): 컨설팅 결과보고서 생성 케이스를 지원신청서 작성·접수로 이관');
  end loop;
end $$;
