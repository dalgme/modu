-- ============================================================================
-- 0006_document_templates.sql
-- 붙임서식 HTML 템플릿 시딩 (지원신청서).
-- 실제 운영에서는 hwp5html 로 변환한 원본 레이아웃으로 html_content 를 교체한다.
-- {{placeholder}} 는 케이스 데이터로 런타임 치환된다.
-- ============================================================================

insert into public.document_templates (template_key, name, attachment_no, html_content, field_mapping)
values
  (
    'support_application_management',
    '경영개선 지원신청서 (붙임5)',
    '붙임5',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:13px}
      h1{text-align:center;font-size:20px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #333;padding:8px 10px;text-align:left}
      th{background:#f0f3f7;width:28%}
      .sign{margin-top:36px;text-align:right}
    </style></head><body>
      <h1>경영개선 지원신청서</h1>
      <table>
        <tr><th>업체명</th><td>{{business_name}}</td><th>대표자</th><td>{{owner_name}}</td></tr>
        <tr><th>사업자등록번호</th><td>{{business_reg_no}}</td><th>연락처</th><td>{{phone}}</td></tr>
        <tr><th>사업장 주소</th><td colspan="3">{{address}}</td></tr>
        <tr><th>업태 / 종목</th><td>{{business_type}} / {{item}}</td><th>상시근로자수</th><td>{{employee_count}}</td></tr>
        <tr><th>지원유형</th><td>{{support_type_name}}</td><th>지원한도</th><td>{{support_limit}}</td></tr>
        <tr><th>신청금액</th><td>{{requested_amount}}</td><th>공사·설비업체</th><td>{{contractor_name}}</td></tr>
        <tr><th>신청 사유·사업내용</th><td colspan="3">{{reason}}</td></tr>
      </table>
      <p class="sign">신청일: {{application_date}} &nbsp;&nbsp; 대표자 {{owner_name}} (서명)</p>
    </body></html>$html$,
    '{}'::jsonb
  ),
  (
    'support_application_closure',
    '폐업정리 지원신청서 (붙임1)',
    '붙임1',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:13px}
      h1{text-align:center;font-size:20px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #333;padding:8px 10px;text-align:left}
      th{background:#f0f3f7;width:28%}
      .sign{margin-top:36px;text-align:right}
    </style></head><body>
      <h1>폐업정리 지원신청서</h1>
      <table>
        <tr><th>업체명</th><td>{{business_name}}</td><th>대표자</th><td>{{owner_name}}</td></tr>
        <tr><th>사업자등록번호</th><td>{{business_reg_no}}</td><th>연락처</th><td>{{phone}}</td></tr>
        <tr><th>사업장 주소</th><td colspan="3">{{address}}</td></tr>
        <tr><th>폐업 구분</th><td>{{closure_status}}</td><th>폐업(예정)일</th><td>{{closed_at}}</td></tr>
        <tr><th>전용면적(평)</th><td>{{exclusive_area_pyeong}}</td><th>지원한도</th><td>{{support_limit}}</td></tr>
        <tr><th>신청금액</th><td>{{requested_amount}}</td><th>공사·설비업체</th><td>{{contractor_name}}</td></tr>
        <tr><th>신청 사유·사업내용</th><td colspan="3">{{reason}}</td></tr>
      </table>
      <p class="sign">신청일: {{application_date}} &nbsp;&nbsp; 대표자 {{owner_name}} (서명)</p>
    </body></html>$html$,
    '{}'::jsonb
  )
on conflict (template_key) do nothing;
