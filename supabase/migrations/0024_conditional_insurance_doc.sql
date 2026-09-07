-- 설계 §2.1 누락 서류 보완: 4대보험 가입자명부(고용인원 있을 시 조건부).
-- 경영개선 지원유형에 조건부(is_required=false) 업로드 항목으로 추가.
insert into public.support_type_documents
  (support_type_id, doc_key, doc_name, is_required, condition, attachment_no, sort_order)
select st.id, 'insurance_roster', '4대보험 가입자명부', false, '상시근로자(고용인원)가 있을 경우 제출', null, 35
from public.support_types st
where st.code = 'management_improvement'
on conflict (support_type_id, doc_key) do nothing;
