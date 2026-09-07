-- 경영개선 지원신청 첨부서류 보완(검수·요구사항 반영):
--  - 외주업체 사업자등록증(필수): 붙임5 첨부서류 '필수' 항목과 정합.
--  - 옥외광고허가증(조건부): 간판 등 옥외광고물 시공 시 제출.
-- (견적서·100만원 이상 비교견적서는 기존 estimate 항목 condition 으로 이미 반영,
--  외주업체 서명은 공사업체 등록 시 필수 캡처로 처리.)
insert into public.support_type_documents
  (support_type_id, doc_key, doc_name, is_required, condition, attachment_no, sort_order)
select st.id, d.doc_key, d.doc_name, d.is_required, d.condition, null, d.sort_order
from public.support_types st
cross join (values
  ('contractor_biz_license', '외주업체 사업자등록증 사본', true, null, 15),
  ('outdoor_ad_permit', '옥외광고허가증(또는 비대상 확인서)', false, '간판 등 옥외광고물 시공 시 제출', 45)
) as d(doc_key, doc_name, is_required, condition, sort_order)
where st.code = 'management_improvement'
on conflict (support_type_id, doc_key) do nothing;
