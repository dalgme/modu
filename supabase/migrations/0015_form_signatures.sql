-- ============================================================================
-- 0015_form_signatures.sql
-- 전 붙임서식의 (인) 서명 자리를 캡처된 서명 이미지 플레이스홀더로 교체.
--  - {{{sign_applicant}}}  신청업체 대표(멘티)
--  - {{{sign_consultant}}} 컨설턴트(멘토)
--  - {{{sign_contractor}}} 외주업체 대표(contractor)
-- 서명이 없으면 렌더 시 '(인)' 로 대체된다(signHtml).
-- template_key 별 정밀 replace.
-- ============================================================================

-- 붙임1 폐업 신청서: 신청업체 대표
update public.document_templates set html_content =
  replace(html_content, '대표 : {{owner_name}} (인)', '대표 : {{owner_name}} {{{sign_applicant}}}')
where template_key = 'support_application_closure';

-- 붙임2 개인정보 동의서: 신청업체 대표
update public.document_templates set html_content =
  replace(html_content, '대표 : {{owner_name}} (인)', '대표 : {{owner_name}} {{{sign_applicant}}}')
where template_key = 'consent_privacy';

-- 붙임3 행정정보 공동이용: 신청업체 대표(서명 또는 인)
update public.document_templates set html_content =
  replace(html_content, '(서명 또는 인)', '{{{sign_applicant}}}')
where template_key = 'consent_admin_info';

-- 붙임5 경영개선 신청서: 신청업체 대표 + 컨설턴트
update public.document_templates set html_content =
  replace(html_content,
    '업체명 : {{business_name}} &nbsp;&nbsp; 대표 : {{owner_name}} (인)',
    '신청업체(대표자) : {{owner_name}} {{{sign_applicant}}} &nbsp;&nbsp; 컨설턴트 : {{consultant_name}} {{{sign_consultant}}}')
where template_key = 'support_application_management';

-- 붙임6 중복지원 확약서: 신청업체 대표
update public.document_templates set html_content =
  replace(html_content, '(대표자) {{owner_name}} (인)', '(대표자) {{owner_name}} {{{sign_applicant}}}')
where template_key = 'pledge_no_overlap';

-- 붙임10 CCTV 방침: 신청업체 대표
update public.document_templates set html_content =
  replace(html_content, '신청업체(대표자) {{owner_name}} (인)', '신청업체(대표자) {{owner_name}} {{{sign_applicant}}}')
where template_key = 'cctv_policy';

-- 붙임11 변경 승인신청: 신청업체 대표
update public.document_templates set html_content =
  replace(html_content, '신청업체(대표자) {{owner_name}} (인)', '신청업체(대표자) {{owner_name}} {{{sign_applicant}}}')
where template_key = 'change_request';

-- 붙임12 포기 신청: 신청업체 대표
update public.document_templates set html_content =
  replace(html_content, '신청업체(대표자) {{owner_name}} (인)', '신청업체(대표자) {{owner_name}} {{{sign_applicant}}}')
where template_key = 'withdrawal_request';

-- 붙임8 하자보증 각서: 신청업체 대표 + 외주업체
update public.document_templates set html_content =
  replace(html_content,
    '<td>신청업체(대표자)<br>{{owner_name}} (인)</td><td>외주업체 대표<br>{{contractor_rep}} (인)</td>',
    '<td>신청업체(대표자)<br>{{owner_name}} {{{sign_applicant}}}</td><td>외주업체 대표<br>{{contractor_rep}} {{{sign_contractor}}}</td>')
where template_key = 'pledge_warranty';

-- 붙임9 옥외광고물 확인: 신청업체 대표 + 외주업체
update public.document_templates set html_content =
  replace(html_content,
    '<td>신청업체(대표자)<br>{{owner_name}} (인)</td><td>외주업체 대표<br>{{contractor_rep}} (인)</td>',
    '<td>신청업체(대표자)<br>{{owner_name}} {{{sign_applicant}}}</td><td>외주업체 대표<br>{{contractor_rep}} {{{sign_contractor}}}</td>')
where template_key = 'outdoor_ad_exempt';

-- 붙임7 경영개선 완료·지급: 신청업체 / 외주업체 / 컨설턴트
update public.document_templates set html_content =
  replace(html_content,
    '<td>신청업체(대표자)<br>{{owner_name}} (인)</td><td>외주업체 대표<br>{{contractor_rep}} (인)</td><td>컨설턴트<br>{{consultant_name}} (인)</td>',
    '<td>신청업체(대표자)<br>{{owner_name}} {{{sign_applicant}}}</td><td>외주업체 대표<br>{{contractor_rep}} {{{sign_contractor}}}</td><td>컨설턴트<br>{{consultant_name}} {{{sign_consultant}}}</td>')
where template_key = 'payment_application_management';

-- 붙임4 폐업 완료·지급: 신청업체 / 컨설턴트 / 외주업체
update public.document_templates set html_content =
  replace(html_content,
    '<td>신청업체(대표자)<br>{{owner_name}} (인)</td><td>컨설턴트<br>{{consultant_name}} (인)</td><td>외주업체 대표<br>{{contractor_rep}} (인)</td>',
    '<td>신청업체(대표자)<br>{{owner_name}} {{{sign_applicant}}}</td><td>컨설턴트<br>{{consultant_name}} {{{sign_consultant}}}</td><td>외주업체 대표<br>{{contractor_rep}} {{{sign_contractor}}}</td>')
where template_key = 'payment_application_closure';
