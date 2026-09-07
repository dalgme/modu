-- ============================================================================
-- 0007_payment_templates.sql
-- 지급신청서·완료보고서 붙임서식 템플릿 시딩.
-- 실제 운영에서는 hwp5html 변환 원본으로 html_content 교체.
-- ============================================================================

insert into public.document_templates (template_key, name, attachment_no, html_content, field_mapping)
values
  (
    'payment_application_management',
    '경영개선 지원금 신청서·완료보고서 (붙임7)',
    '붙임7',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      body{font-family:'Malgun Gothic',sans-serif;color:#111;font-size:13px}
      h1{text-align:center;font-size:20px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #333;padding:8px 10px;text-align:left}th{background:#f0f3f7;width:28%}
      .note{margin-top:16px;font-size:12px;color:#444}
    </style></head><body>
      <h1>지원금 신청서 · 완료보고서</h1>
      <table>
        <tr><th>업체명</th><td>{{business_name}}</td><th>대표자</th><td>{{owner_name}}</td></tr>
        <tr><th>지원유형</th><td>{{support_type_name}}</td><th>지원한도</th><td>{{support_limit}}</td></tr>
        <tr><th>지급 신청금액</th><td>{{amount}}</td><th>공사·설비업체</th><td>{{contractor_name}}</td></tr>
        <tr><th>지급계좌</th><td colspan="3">{{bank_name}} {{account_number}} (예금주: {{account_holder}})</td></tr>
      </table>
      <p class="note">※ 지급계좌는 반드시 대표자 본인(또는 법인) 명의여야 합니다.</p>
      <p class="note">※ 완료보고서 제출기한: {{report_due_date}} (선정통보 후 3개월 이내)</p>
      <p class="note" style="text-align:right;margin-top:30px">신청일: {{application_date}} 대표자 {{owner_name}} (서명)</p>
    </body></html>$html$,
    '{}'::jsonb
  ),
  (
    'payment_application_closure',
    '폐업정리 지원금 신청서·완료보고서 (붙임4)',
    '붙임4',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      body{font-family:'Malgun Gothic',sans-serif;color:#111;font-size:13px}
      h1{text-align:center;font-size:20px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #333;padding:8px 10px;text-align:left}th{background:#f0f3f7;width:28%}
      .note{margin-top:16px;font-size:12px;color:#444}
    </style></head><body>
      <h1>지원금 신청서 · 완료보고서 (폐업정리)</h1>
      <table>
        <tr><th>업체명</th><td>{{business_name}}</td><th>대표자</th><td>{{owner_name}}</td></tr>
        <tr><th>전용면적(평)</th><td>{{exclusive_area_pyeong}}</td><th>지원한도</th><td>{{support_limit}}</td></tr>
        <tr><th>지급 신청금액</th><td>{{amount}}</td><th>공사·설비업체</th><td>{{contractor_name}}</td></tr>
        <tr><th>지급계좌</th><td colspan="3">{{bank_name}} {{account_number}} (예금주: {{account_holder}})</td></tr>
      </table>
      <p class="note">※ 지급계좌는 반드시 대표자 본인(또는 법인) 명의여야 합니다.</p>
      <p class="note">※ 완료보고서 제출기한: {{report_due_date}} (선정통보 후 3개월 이내)</p>
      <p class="note" style="text-align:right;margin-top:30px">신청일: {{application_date}} 대표자 {{owner_name}} (서명)</p>
    </body></html>$html$,
    '{}'::jsonb
  )
on conflict (template_key) do nothing;
