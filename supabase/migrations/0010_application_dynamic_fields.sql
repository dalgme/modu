-- ============================================================================
-- 0010_application_dynamic_fields.sql
-- 붙임5(경영개선 신청서) 템플릿을 동적 신청항목 체크(■/□)와
-- 소요금액(부가세 제외) 플레이스홀더로 갱신.
--  - {{cat_hygiene}}/{{cat_safety}}/{{cat_promo}}/{{cat_env}}/{{cat_pos}}
--  - {{cost_excl_vat}} (소요금액), {{requested_amount}} (지원금 신청액)
-- ============================================================================
update public.document_templates set
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 12mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.5}
    .att{font-size:12px;color:#333}
    h1{text-align:center;font-size:19px;margin:6px 0 16px}
    h2{font-size:13px;margin:16px 0 6px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;vertical-align:middle;word-break:break-all}
    th{background:#eef2f7;font-weight:600;text-align:center}
    .l{text-align:left}.chk{letter-spacing:2px}
    .sign{margin-top:24px;text-align:center;line-height:2}
    .foot{margin-top:8px;text-align:center;font-weight:600}
  </style></head><body>
    <div class="att">붙임5</div>
    <h1>대전 소상공인·자영업자 재기지원사업 경영개선지원 신청서</h1>
    <h2>1. 지원업체 현황</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td class="l">{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td class="l">{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td class="l">{{owner_name}}</td><th>연락처</th><td class="l">{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td class="l" colspan="3">{{address}}</td></tr>
      <tr><th>상시근로자<br>(대표자 제외)</th><td class="l">{{employee_count}} 명</td><th>개업연월일</th><td class="l">{{opened_at}}</td></tr>
      <tr><th>업 태</th><td class="l">{{business_type}}</td><th>종 목</th><td class="l">{{item}}</td></tr></table>
    <h2>2. 컨설팅</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>성 명<br>(컨설턴트)</th><td class="l">{{consultant_name}}</td><th>연락처<br>(컨설턴트)</th><td class="l">{{consultant_phone}}</td></tr>
      <tr><th>컨설팅일자</th><td class="l" colspan="3">(1차) {{consulting_date_1}} &nbsp; (2차) {{consulting_date_2}} &nbsp; (3차) {{consulting_date_3}}</td></tr></table>
    <h2>3. 경영개선자금 신청내역</h2>
    <table><colgroup><col style="width:18%"><col style="width:82%"></colgroup>
      <tr><th>총 신청내역</th><td class="l chk">{{cat_hygiene}} 위생관리 &nbsp; {{cat_safety}} 안전관리 &nbsp; {{cat_promo}} 홍보(광고) &nbsp; {{cat_env}} 환경개선 &nbsp; {{cat_pos}} POS경비</td></tr>
      <tr><th>총소요비용</th><td class="l">※ 지원금 최대 300만원 (부가가치세는 자부담)</td></tr>
      <tr><th>소요금액<br>(부가세 제외)</th><td class="l">{{cost_excl_vat}} 원</td></tr>
      <tr><th>지원금신청액<br>(소요금액의 100%)</th><td class="l">{{requested_amount}} 원</td></tr>
      <tr><th>시공(제작)<br>내용</th><td class="l">{{reason}}</td></tr></table>
    <h2>4. 시공(제작) 내용</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>단위사업</th><td class="l chk" colspan="3">{{cat_hygiene}} 위생관리 &nbsp; {{cat_safety}} 안전관리 &nbsp; {{cat_promo}} 홍보(광고) &nbsp; {{cat_env}} 환경개선 &nbsp; {{cat_pos}} POS경비</td></tr>
      <tr><th>외주 업체명<br>(업체 지역)</th><td class="l">{{contractor_name}}</td><th>사업자등록번호</th><td class="l">{{contractor_reg_no}}</td></tr>
      <tr><th>대표자명</th><td class="l">{{contractor_rep}}</td><th>업태/종목</th><td class="l">{{contractor_work_type}}</td></tr>
      <tr><th>사업장 연락처</th><td class="l">{{contractor_phone}}</td><th>휴대전화</th><td class="l"></td></tr>
      <tr><th>시공기간</th><td class="l"></td><th>소요금액</th><td class="l">{{contractor_amount}}</td></tr>
      <tr><th>시공내용</th><td class="l" colspan="3">{{contractor_work_type}}</td></tr></table>
    <div class="sign">위와 같이 경영개선지원을 신청합니다.<br>신청일 : {{application_date}}<br>업체명 : {{business_name}} &nbsp;&nbsp; 대표 : {{owner_name}} (인)</div>
    <div class="foot">{{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'support_application_management';
