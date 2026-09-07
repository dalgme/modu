-- ============================================================================
-- 0004_seed.sql
-- 지원유형·필수서류 초기 시딩.
-- 자격심사/정원 로직은 진흥원 별도 처리 → 여기엔 금액·서류 규칙만.
-- 필수서류는 /admin/settings/support-types 에서 관리자가 수정 가능(하드코딩 금지).
-- ============================================================================

-- 지원유형 2종
insert into public.support_types (code, name, limit_amount, calc_method, area_unit_price, description)
values
  ('management_improvement', '경영개선', 3000000, 'fixed', null,
   '한도 300만원 정액 지원'),
  ('closure', '폐업정리', 5000000, 'area_cap', 200000,
   '전용면적(평) × 20만원 과 500만원 중 낮은 금액')
on conflict (code) do nothing;

-- 경영개선 필수·조건부 서류
insert into public.support_type_documents
  (support_type_id, doc_key, doc_name, is_required, condition, attachment_no, sort_order)
select st.id, d.doc_key, d.doc_name, d.is_required, d.condition, d.attachment_no, d.sort_order
from public.support_types st
cross join (values
  ('estimate', '견적서', true, '100만원 이상 시 2개 이상 첨부', null, 10),
  ('business_plan_photo', '사업추진계획서(사진)', true, null, null, 20),
  ('bank_account_copy', '통장사본(대표자 명의)', true, null, null, 30),
  ('id_card', '대표자 신분증 사본', true, null, null, 40)
) as d(doc_key, doc_name, is_required, condition, attachment_no, sort_order)
where st.code = 'management_improvement'
on conflict (support_type_id, doc_key) do nothing;

-- 폐업정리 필수·조건부 서류 (가족관계증명서·임대차계약서 추가)
insert into public.support_type_documents
  (support_type_id, doc_key, doc_name, is_required, condition, attachment_no, sort_order)
select st.id, d.doc_key, d.doc_name, d.is_required, d.condition, d.attachment_no, d.sort_order
from public.support_types st
cross join (values
  ('estimate', '견적서', true, '100만원 이상 시 2개 이상 첨부', null, 10),
  ('family_relation_cert', '가족관계증명서', true, null, null, 20),
  ('lease_contract', '임대차계약서', true, null, null, 30),
  ('bank_account_copy', '통장사본(대표자 명의)', true, null, null, 40),
  ('id_card', '대표자 신분증 사본', true, null, null, 50)
) as d(doc_key, doc_name, is_required, condition, attachment_no, sort_order)
where st.code = 'closure'
on conflict (support_type_id, doc_key) do nothing;
