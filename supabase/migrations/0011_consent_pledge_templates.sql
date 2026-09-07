-- ============================================================================
-- 0011_consent_pledge_templates.sql
-- 동의·확약 계열 붙임서식 템플릿 추가.
--  - 붙임2  개인정보 수집·이용 및 제공 동의서   (consent_privacy)      · 원문 재현
--  - 붙임3  행정정보 공동이용 사전동의서        (consent_admin_info)   · 원문 재현
--  - 붙임6  사업참여 및 중복지원 금지 확약서     (pledge_no_overlap)    · 표준서식(원본 미보유)
--  - 붙임8  하자보증 이행각서                   (pledge_warranty)      · 표준서식(원본 미보유)
--  - 붙임11 사업 변경승인 요청서                (change_request)       · 표준서식(원본 미보유)
--  - 붙임12 지원사업 포기 신청서                (withdrawal_request)   · 표준서식(원본 미보유)
-- 케이스 데이터로 업체 식별정보만 채우고, 동의 체크·서명은 인쇄 후 수기 처리.
-- ============================================================================

insert into public.document_templates (template_key, name, attachment_no, html_content, field_mapping)
values
  (
    'consent_privacy', '개인정보 수집·이용 및 제공 동의서 (붙임2)', '붙임2',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:16mm 14mm}
      body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
      h1{text-align:center;font-size:18px;margin:4px 0 18px}
      h2{font-size:13px;margin:16px 0 4px}
      ul{margin:2px 0 8px 16px;padding:0}
      .agree{margin:6px 0;font-weight:600}
      .stmt{margin-top:14px}
      .sign{margin-top:20px;text-align:center;line-height:2}
      .foot{margin-top:6px;text-align:center;font-weight:600}
    </style></head><body>
      <h1>개인정보 수집·이용 및 제공 동의서</h1>
      <h2>□ 개인정보 수집 및 이용 동의</h2>
      <ul>
        <li>수집 및 이용목적 : 「대전 소상공인·자영업자 재기지원」의 운영 및 관리를 위한 이용</li>
        <li>수집·이용 항목 : 성명, 연락처, 사업자등록번호, 사업장 소재지, E-mail 등</li>
        <li>보유 및 이용 기간 : 동의일로부터 보유목적 달성 시 또는 삭제 요청 시 지체 없이 파기(보존기간 5년)</li>
        <li>동의 거부 권리 및 불이익 : 본 사업 수행을 위한 필수 항목으로, 미동의 시 사업 신청 불가</li>
      </ul>
      <p class="agree">본인은 개인정보 수집 및 이용에 동의합니다. &nbsp; □ 동의 &nbsp;&nbsp; □ 동의하지 않음</p>
      <h2>□ 개인정보 제3자 제공 동의</h2>
      <ul>
        <li>제공받는 자 : 대전광역시, 대전일자리경제진흥원, 「대전 소상공인·자영업자 재기지원」 협업기관 등</li>
        <li>이용 목적 : 사업의 운영 및 관리</li>
        <li>제공 항목 : 수집·이용에 동의한 정보 중 업무 목적 달성을 위해 필요한 정보</li>
        <li>보유 및 이용 기간 : 제공일로부터 5년(목적 달성 또는 삭제 요청 시 지체 없이 파기)</li>
        <li>동의 거부 권리 및 불이익 : 미동의 시 사업 신청 불가</li>
      </ul>
      <p class="agree">본인은 개인정보 제공에 동의합니다. &nbsp; □ 동의 &nbsp;&nbsp; □ 동의하지 않음</p>
      <p class="stmt">본인은 「개인정보 보호법」 제15조, 제17조, 제24조 등에 의거하여 「대전 소상공인·자영업자 재기지원」과 관련된 본인의 개인정보 수집·이용에 동의하고, 수집된 개인정보를 원활한 지원사업 추진을 위해 제3자에게 제공하는 것에 동의합니다.</p>
      <div class="sign">{{today}}<br>업체명 : {{business_name}} &nbsp;&nbsp; 대표 : {{owner_name}} (인)</div>
      <div class="foot">{{institution}} 귀하</div>
    </body></html>$html$,
    '{}'::jsonb
  ),
  (
    'consent_admin_info', '행정정보 공동이용 사전동의서 (붙임3)', '붙임3',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:16mm 14mm}
      body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
      h1{text-align:center;font-size:18px;margin:4px 0 16px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      th,td{border:1px solid #555;padding:7px 8px;word-break:break-all}
      th{background:#eef2f7;font-weight:600;text-align:left;width:34%}
      .stmt{margin-top:12px;font-size:11px}
      .rrn{margin-top:10px}
      .sign{margin-top:18px;text-align:center;line-height:2}
      .foot{margin-top:6px;text-align:center;font-weight:600}
    </style></head><body>
      <h1>행정정보 공동이용 사전동의서</h1>
      <table>
        <tr><th>이용기관 명칭</th><td>대전광역시, 대전일자리경제진흥원</td></tr>
        <tr><th>이용사무(이용목적)</th><td>대전 소상공인·자영업자 재기지원사업</td></tr>
        <tr><th>공동이용 행정정보 보유·이용 기간</th><td>최대 5년</td></tr>
        <tr><th>제공하는 정보</th><td>성명, 주민등록번호, 고유식별번호 등</td></tr>
        <tr><th>공동이용 행정정보(첨부서류)</th><td>사업자등록증명, 중소기업확인서, 건강보험자격득실확인서, 부가가치세과세표준증명, 부가가치세면세사업자수입금액증명, (국세)납세증명서, 지방세납세증명서, 일반건축물대장</td></tr>
      </table>
      <p class="stmt">본인은 위 사무의 처리를 위하여 「전자정부법」 제36조에 따른 행정정보의 공동이용을 통하여 이용기관의 업무처리담당자가 전자적으로 본인의 공동이용 행정정보(첨부서류)를 확인하는 것에 동의합니다.<br>※ 동의하지 아니할 경우에도 불이익은 없으며, 동의하지 아니한 경우 본인이 해당 첨부서류를 직접 제출하여야 합니다.</p>
      <p class="rrn">주민등록번호(전체 13자리) : ______________ - ______________</p>
      <div class="sign">{{today}}<br>대상자(본인) 성명 : {{owner_name}} (서명 또는 인) &nbsp;&nbsp; 전화번호 : {{phone}}</div>
      <div class="foot">{{institution}} 귀하</div>
    </body></html>$html$,
    '{}'::jsonb
  ),
  (
    'pledge_no_overlap', '사업참여 및 중복지원 금지 확약서 (붙임6)', '붙임6',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:16mm 14mm}
      body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
      h1{text-align:center;font-size:18px;margin:4px 0 16px}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}
      th,td{border:1px solid #555;padding:7px 8px;text-align:left}
      th{background:#eef2f7;width:24%}
      ol{margin:8px 0 0 18px}
      li{margin-bottom:6px}
      .sign{margin-top:20px;text-align:center;line-height:2}
      .foot{margin-top:6px;text-align:center;font-weight:600}
      .draft{margin-top:6px;font-size:10px;color:#888;text-align:center}
    </style></head><body>
      <h1>사업참여 및 중복지원 금지 확약서</h1>
      <table>
        <tr><th>업체명</th><td>{{business_name}}</td><th>대표자</th><td>{{owner_name}}</td></tr>
        <tr><th>사업자등록번호</th><td colspan="3">{{business_reg_no}}</td></tr>
      </table>
      <p>본인은 「대전 소상공인·자영업자 재기지원사업」에 참여함에 있어 다음 사항을 성실히 이행할 것을 확약합니다.</p>
      <ol>
        <li>동일 목적의 정부·지방자치단체 등 타 지원사업과 중복하여 지원받지 아니합니다.</li>
        <li>중복수혜 사실이 확인될 경우 지원금 전액을 환수당하여도 이의를 제기하지 아니합니다.</li>
        <li>신청 내용이 사실과 다르거나 위법·부당한 방법으로 지원받은 사실이 확인될 경우 지원 배제 및 환수 조치에 따릅니다.</li>
      </ol>
      <div class="sign">{{today}}<br>업체명 : {{business_name}} &nbsp;&nbsp; 대표 : {{owner_name}} (인)</div>
      <div class="foot">{{institution}} 귀하</div>
      <p class="draft">※ 본 서식은 표준 확약서 양식입니다. 진흥원 공식 붙임6 원본 확정 시 교체 예정.</p>
    </body></html>$html$,
    '{}'::jsonb
  ),
  (
    'pledge_warranty', '하자보증 이행각서 (붙임8)', '붙임8',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:16mm 14mm}
      body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
      h1{text-align:center;font-size:18px;margin:4px 0 16px}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}
      th,td{border:1px solid #555;padding:7px 8px;text-align:left}
      th{background:#eef2f7;width:24%}
      ol{margin:8px 0 0 18px}li{margin-bottom:6px}
      .signrow{margin-top:18px;width:100%;border-collapse:collapse}
      .signrow td{border:1px solid #555;padding:10px;text-align:center}
      .foot{margin-top:8px;text-align:center;font-weight:600}
      .draft{margin-top:6px;font-size:10px;color:#888;text-align:center}
    </style></head><body>
      <h1>하자보증 이행각서</h1>
      <table>
        <tr><th>신청업체</th><td>{{business_name}} ({{owner_name}})</td><th>외주업체</th><td>{{contractor_name}} ({{contractor_rep}})</td></tr>
      </table>
      <p>외주업체는 위 신청업체의 시공(제작) 건에 대하여 다음과 같이 하자보증 의무를 성실히 이행할 것을 각서합니다.</p>
      <ol>
        <li>하자보증기간 : 시공(제작) 완료일로부터 _____ 개월</li>
        <li>보증기간 내 하자 발생 시 무상으로 보수·보완합니다.</li>
        <li>정당한 사유 없이 하자보수를 이행하지 아니할 경우 그에 따른 책임을 부담합니다.</li>
      </ol>
      <table class="signrow"><tr><td>신청업체(대표자)<br>{{owner_name}} (인)</td><td>외주업체(대표자)<br>{{contractor_rep}} (인)</td></tr></table>
      <div class="foot">{{today}} &nbsp; · &nbsp; {{institution}} 귀하</div>
      <p class="draft">※ 본 서식은 표준 각서 양식입니다. 진흥원 공식 붙임8 원본 확정 시 교체 예정.</p>
    </body></html>$html$,
    '{}'::jsonb
  ),
  (
    'change_request', '사업 변경승인 요청서 (붙임11)', '붙임11',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:16mm 14mm}
      body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
      h1{text-align:center;font-size:18px;margin:4px 0 16px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      th,td{border:1px solid #555;padding:7px 8px;text-align:left;word-break:break-all}
      th{background:#eef2f7;width:20%}
      .box td{height:56px;vertical-align:top}
      .sign{margin-top:18px;text-align:center;line-height:2}
      .foot{margin-top:6px;text-align:center;font-weight:600}
      .draft{margin-top:6px;font-size:10px;color:#888;text-align:center}
    </style></head><body>
      <h1>사업 변경승인 요청서</h1>
      <table>
        <tr><th>업체명</th><td>{{business_name}}</td><th>대표자</th><td>{{owner_name}}</td></tr>
        <tr><th>사업자등록번호</th><td colspan="3">{{business_reg_no}}</td></tr>
      </table>
      <table style="margin-top:10px">
        <tr><th>변경 전</th><td class="box"></td></tr>
        <tr><th>변경 후</th><td class="box"></td></tr>
        <tr><th>변경 사유</th><td class="box"></td></tr>
      </table>
      <p style="margin-top:10px">위와 같이 사업 변경승인을 요청합니다.</p>
      <div class="sign">{{today}}<br>업체명 : {{business_name}} &nbsp;&nbsp; 대표 : {{owner_name}} (인)</div>
      <div class="foot">{{institution}} 귀하</div>
      <p class="draft">※ 본 서식은 표준 요청서 양식입니다. 진흥원 공식 붙임11 원본 확정 시 교체 예정.</p>
    </body></html>$html$,
    '{}'::jsonb
  ),
  (
    'withdrawal_request', '지원사업 포기 신청서 (붙임12)', '붙임12',
    $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:16mm 14mm}
      body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
      h1{text-align:center;font-size:18px;margin:4px 0 16px}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      th,td{border:1px solid #555;padding:7px 8px;text-align:left;word-break:break-all}
      th{background:#eef2f7;width:20%}
      .box td{height:80px;vertical-align:top}
      .sign{margin-top:18px;text-align:center;line-height:2}
      .foot{margin-top:6px;text-align:center;font-weight:600}
      .draft{margin-top:6px;font-size:10px;color:#888;text-align:center}
    </style></head><body>
      <h1>지원사업 포기 신청서</h1>
      <table>
        <tr><th>업체명</th><td>{{business_name}}</td><th>대표자</th><td>{{owner_name}}</td></tr>
        <tr><th>사업자등록번호</th><td colspan="3">{{business_reg_no}}</td></tr>
      </table>
      <table style="margin-top:10px"><tr><th>포기 사유</th><td class="box"></td></tr></table>
      <p style="margin-top:10px">위와 같이 「대전 소상공인·자영업자 재기지원사업」의 지원을 포기함을 신청합니다.</p>
      <div class="sign">{{today}}<br>업체명 : {{business_name}} &nbsp;&nbsp; 대표 : {{owner_name}} (인)</div>
      <div class="foot">{{institution}} 귀하</div>
      <p class="draft">※ 본 서식은 표준 신청서 양식입니다. 진흥원 공식 붙임12 원본 확정 시 교체 예정.</p>
    </body></html>$html$,
    '{}'::jsonb
  )
on conflict (template_key) do update set
  name = excluded.name, attachment_no = excluded.attachment_no, html_content = excluded.html_content;
