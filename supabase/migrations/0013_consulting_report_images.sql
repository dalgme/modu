-- ============================================================================
-- 0013_consulting_report_images.sql
-- 컨설팅 결과보고서 템플릿에 현장사진·컨설턴트 서명 이미지 플레이스홀더 적용.
--  - {{{consultant_sign_html}}} : 컨설턴트(멘토) 서명 이미지 or (인)
--  - {{{photo1_html}}} / {{{photo2_html}}} : 현장사진 이미지 or 안내문구
-- (원시 삽입 {{{ }}} 는 renderTemplate 이 이스케이프하지 않음)
-- ============================================================================
update public.document_templates set
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 12mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.5}
    h1{text-align:center;font-size:18px;margin:6px 0 16px}
    h2{font-size:13px;margin:16px 0 6px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;word-break:break-all;vertical-align:top}
    th{background:#eef2f7;font-weight:600;text-align:center}
    .l{text-align:left}.box{min-height:64px}
    .photo{height:150px;text-align:center;color:#999;font-size:11px;vertical-align:middle}
  </style></head><body>
    <h1>대전 소상공인·자영업자 재기지원사업 컨설팅 결과보고서</h1>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>업 체 명</th><td class="l">{{business_name}}</td><th>대 표 자</th><td class="l">{{owner_name}}</td></tr>
      <tr><th>일 시</th><td class="l">{{visited_at}}</td><th>장 소</th><td class="l">{{place}}</td></tr>
      <tr><th>컨설팅주제</th><td class="l">{{topic}}</td><th>컨설턴트</th><td class="l">{{consultant_name}} {{{consultant_sign_html}}}</td></tr></table>
    <h2>1. 컨설팅</h2>
    <table><colgroup><col style="width:18%"><col style="width:82%"></colgroup>
      <tr><th>기업 애로사항 등</th><td class="l box">{{difficulties}}</td></tr>
      <tr><th>컨설팅 내용</th><td class="l box">{{content}}</td></tr>
      <tr><th>컨설팅 결과</th><td class="l box">{{result}}</td></tr></table>
    <h2>2. 현장사진</h2>
    <table><colgroup><col style="width:50%"><col style="width:50%"></colgroup>
      <tr><th>사진1</th><th>사진2</th></tr>
      <tr><td class="photo">{{{photo1_html}}}</td><td class="photo">{{{photo2_html}}}</td></tr></table>
    <p style="text-align:right;margin-top:14px">작성일 : {{report_date}}</p>
  </body></html>$html$
where template_key = 'consulting_result_report';
