-- ============================================================================
-- 0012_faithful_attachment_forms.sql
-- 첨부 원본(붙임5~12 패킷) 기준으로 확약·확인·변경·포기 서식을 실제 양식대로 교체하고
-- 붙임9(옥외광고물 비대상 확인서)·붙임10(CCTV 운영·관리 방침)을 신규 추가.
--  - 붙임6  사업참여 및 중복지원 금지 확약서   (pledge_no_overlap)   · 원문
--  - 붙임7  경영개선 완료보고서·지원금 신청서   (payment_application_management) · 원문 상세
--  - 붙임8  하자보증 이행각서                 (pledge_warranty)     · 원문
--  - 붙임9  옥외광고물 표시 신고(허가) 비대상 확인서 (outdoor_ad_exempt) · 원문(신규)
--  - 붙임10 영상정보처리기기 운영·관리 방침    (cctv_policy)         · 원문(신규)
--  - 붙임11 경영개선지원 변경 승인신청서       (change_request)      · 원문
--  - 붙임12 경영개선지원 포기 신청서           (withdrawal_request)  · 원문
-- 공통 스타일 s0: 표 기반 서식.
-- ============================================================================

-- 붙임6 · 사업참여 및 중복지원 금지 확약서
update public.document_templates set
  name = '사업참여 및 중복지원 금지 확약서 (붙임6)', attachment_no = '붙임6',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:16mm 14mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
    h1{text-align:center;font-size:18px;margin:4px 0 14px}
    table{width:100%;border-collapse:collapse;table-layout:fixed;margin-bottom:12px}
    th,td{border:1px solid #555;padding:7px 8px;text-align:left;word-break:break-all}
    th{background:#eef2f7;width:18%;text-align:center}
    ol{margin:6px 0 0 16px}li{margin-bottom:6px}
    .stmt{margin-top:12px}
    .sign{margin-top:18px;text-align:center;line-height:2}
    .foot{margin-top:6px;text-align:center;font-weight:600}
  </style></head><body>
    <h1>사업참여 및 중복지원 금지 확약서</h1>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>업 체 명</th><td>{{business_name}}</td><th>대표자</th><td>{{owner_name}}</td></tr>
      <tr><th>사업자등록번호</th><td>{{business_reg_no}}</td><th>전화번호</th><td>{{phone}}</td></tr>
      <tr><th>업 태</th><td>{{business_type}}</td><th>종 목</th><td>{{item}}</td></tr>
      <tr><th>사업장 주소</th><td colspan="3">{{address}}</td></tr></table>
    <ol>
      <li>본인은 「대전 소상공인·자영업자 재기지원사업」 참여를 위하여 공고문 및 신청서 내용을 확인하였으며, 제반사항을 준수하여 사업을 수행하겠음.</li>
      <li>본인은 중앙정부 및 대전시·자치구 등 타 지원기관에서 실시하고 있는 경영개선 지원사업(경영환경개선사업)에 동일·유사한 내용으로 중복적인 지원을 받지 않겠음을 확약함.</li>
      <li>만약, 중복지원을 받는 경우 지원금 환수 조치 등 민·형사상의 책임을 부담할 것을 확인함.</li>
      <li>본인은 지원금 신청 내용과 증빙자료가 진실하며, 사실과 다르거나 위법·부당한 방법을 통하여 지원받을 경우 지원액 전액 환수 및 향후 지원사업에서 배제되며, 발생하는 모든 법적 책임을 부담할 것을 확약함.</li>
    </ol>
    <p class="stmt">위와 같이 「대전 소상공인·자영업자 재기지원(컨설팅·경영개선) 사업」에 참여하기 위해 사업 참여 및 중복지원 금지 확약서를 제출합니다.</p>
    <div class="sign">{{today}}<br>(업체명) {{business_name}} &nbsp;&nbsp; (대표자) {{owner_name}} (인)</div>
    <div class="foot">(재){{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'pledge_no_overlap';

-- 붙임8 · 하자보증 이행각서
update public.document_templates set
  name = '하자보증 이행각서 (붙임8)', attachment_no = '붙임8',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:16mm 14mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
    h1{text-align:center;font-size:17px;margin:4px 0 14px}
    h2{font-size:13px;margin:14px 0 4px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;text-align:left;word-break:break-all}
    th{background:#eef2f7;text-align:center}
    .oath{margin-top:14px;border:1px solid #555;padding:12px}
    .oath h3{text-align:center;margin:0 0 8px}
    .signrow{margin-top:16px;width:100%;border-collapse:collapse}
    .signrow td{border:1px solid #555;padding:10px;text-align:center}
    .foot{margin-top:8px;text-align:center;font-weight:600}
  </style></head><body>
    <h1>대전 소상공인·자영업자 재기지원(경영개선) 하자보증 이행각서</h1>
    <h2>1. 지원업체 현황</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td>{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td>{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td>{{owner_name}}</td><th>대표자 연락처</th><td>{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td colspan="3">{{address}}</td></tr></table>
    <h2>2. 외주(제작)업체</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>업 체 명</th><td>{{contractor_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td>{{contractor_reg_no}}</td></tr>
      <tr><th>대표자</th><td>{{contractor_rep}}</td><th>연락처</th><td>{{contractor_phone}}</td></tr>
      <tr><th>사업장 주소</th><td colspan="3">{{contractor_address}}</td></tr>
      <tr><th>공사내용</th><td>{{contractor_work_type}}</td><th>공사기간</th><td>&nbsp;&nbsp;월 &nbsp;일 ~ &nbsp;월 &nbsp;일</td></tr>
      <tr><th>공사금액<br>(부가세별도)</th><td>{{contractor_amount}}</td><th>하자보수<br>이행방법</th><td></td></tr></table>
    <div class="oath">
      <h3>이 행 각 서</h3>
      외주업체가 시행한 위의 공사(또는 제품)에 대한 하자보수를 이행함에 있어 최소 1년 이상의 기간 동안 하자가 발생하는 즉시 실액 변상 또는 재시공 할 것을 확약합니다.<br>
      ※ 각 공사(또는 제품)의 보증기간이 1년 이상인 경우 시공업체의 방침에 따름
    </div>
    <table class="signrow"><tr><td>신청업체(대표자)<br>{{owner_name}} (인)</td><td>외주업체 대표<br>{{contractor_rep}} (인)</td></tr></table>
    <div class="foot">{{today}} &nbsp; · &nbsp; {{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'pledge_warranty';

-- 붙임11 · 경영개선지원 변경 승인신청서
update public.document_templates set
  name = '경영개선지원 변경 승인신청서 (붙임11)', attachment_no = '붙임11',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:16mm 14mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
    h1{text-align:center;font-size:17px;margin:4px 0 14px}
    h2{font-size:13px;margin:14px 0 4px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;text-align:left;word-break:break-all}
    th{background:#eef2f7;text-align:center}.chk{letter-spacing:2px}
    .box td{height:44px;vertical-align:top}
    .stmt{margin-top:12px}
    .sign{margin-top:16px;text-align:center;line-height:2}
    .foot{margin-top:6px;text-align:center;font-weight:600}
  </style></head><body>
    <h1>대전 소상공인·자영업자 재기지원사업 경영개선지원 변경 승인신청서</h1>
    <h2>1. 지원업체 현황</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td>{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td>{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td>{{owner_name}}</td><th>연락처</th><td>{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td colspan="3">{{address}}</td></tr></table>
    <h2>2. 변경 승인내용</h2>
    <table><colgroup><col style="width:18%"><col style="width:82%"></colgroup>
      <tr><th>단위사업</th><td class="chk">□ 위생관리 &nbsp; □ 안전관리 &nbsp; □ 홍보(광고) &nbsp; □ 환경개선 &nbsp; □ POS경비 &nbsp; □ 위생방역</td></tr>
      <tr><th>시공(제작)내용</th><td class="box"></td></tr>
      <tr><th>시공(제작)금액<br>(부가세 제외)</th><td>&nbsp; 원 &nbsp;&nbsp; / &nbsp;&nbsp; 지원금(소요금액 100%) : &nbsp; 원</td></tr>
      <tr><th>변경내용</th><td class="chk">□ 시공업체 변경 &nbsp; □ 시공금액 변경 &nbsp; □ 시공내용 변경 &nbsp; □ 기타사유(&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
      <tr><th>변경 (전)</th><td class="box"></td></tr>
      <tr><th>변경 (후)</th><td class="box"></td></tr>
      <tr><th>완료예정 일자</th><td>&nbsp;&nbsp;년 &nbsp;월 &nbsp;일</td></tr></table>
    <p class="stmt">위 본인은 대전일자리경제진흥원에서 추진하는 대전 소상공인·자영업자 재기지원사업의 경영개선지원사업에 선정되었으나, 상기 이유로 인하여 경영개선지원을 변경하기에 신청서를 제출합니다.</p>
    <div class="sign">{{today}}<br>신청업체(대표자) {{owner_name}} (인)</div>
    <div class="foot">{{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'change_request';

-- 붙임12 · 경영개선지원 포기 신청서
update public.document_templates set
  name = '경영개선지원 포기 신청서 (붙임12)', attachment_no = '붙임12',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:16mm 14mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
    h1{text-align:center;font-size:17px;margin:4px 0 14px}
    h2{font-size:13px;margin:14px 0 4px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;text-align:left;word-break:break-all}
    th{background:#eef2f7;text-align:center}.chk{letter-spacing:2px}
    .box td{height:64px;vertical-align:top}
    .stmt{margin-top:12px}
    .sign{margin-top:16px;text-align:center;line-height:2}
    .foot{margin-top:6px;text-align:center;font-weight:600}
  </style></head><body>
    <h1>대전 소상공인·자영업자 재기지원사업 경영개선지원 포기 신청서</h1>
    <h2>1. 지원업체 현황</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td>{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td>{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td>{{owner_name}}</td><th>연락처</th><td>{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td colspan="3">{{address}}</td></tr></table>
    <h2>2. 포기내용</h2>
    <table><colgroup><col style="width:18%"><col style="width:82%"></colgroup>
      <tr><th>단위사업</th><td class="chk">□ 위생관리 &nbsp; □ 안전관리 &nbsp; □ 홍보(광고) &nbsp; □ 환경개선 &nbsp; □ POS경비</td></tr>
      <tr><th>시공(제작)내용</th><td class="box"></td></tr>
      <tr><th>포기사유</th><td class="box"></td></tr></table>
    <p class="stmt">위 본인은 대전일자리경제진흥원에서 추진하는 대전 소상공인·자영업자 재기지원(컨설팅·경영개선) 사업에 선정되었으나, 상기 이유로 인하여 경영개선지원을 포기하기에 신청서를 제출합니다.</p>
    <div class="sign">{{today}}<br>신청업체(대표자) {{owner_name}} (인)</div>
    <div class="foot">{{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'withdrawal_request';

-- 붙임9 · 옥외광고물 표시 신고(허가) 비대상 확인서 (신규)
insert into public.document_templates (template_key, name, attachment_no, html_content, field_mapping)
values ('outdoor_ad_exempt', '옥외광고물 표시 신고(허가) 비대상 확인서 (붙임9)', '붙임9',
  $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:16mm 14mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
    h1{text-align:center;font-size:16px;margin:4px 0 14px}
    h2{font-size:13px;margin:14px 0 4px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;text-align:left;word-break:break-all}
    th{background:#eef2f7;text-align:center}.chk{letter-spacing:1px}
    .stmt{margin-top:12px;font-size:11px}
    .signrow{margin-top:16px;width:100%;border-collapse:collapse}
    .signrow td{border:1px solid #555;padding:10px;text-align:center}
    .foot{margin-top:8px;text-align:center;font-weight:600}
  </style></head><body>
    <h1>대전 소상공인·자영업자 재기지원사업 경영개선지원<br>옥외광고물 표시 신고(허가) 비대상 확인서</h1>
    <h2>1. 지원업체 현황</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td>{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td>{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td>{{owner_name}}</td><th>대표자 연락처</th><td>{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td colspan="3">{{address}}</td></tr></table>
    <h2>2. 외주(제작)업체</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>업 체 명</th><td>{{contractor_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td>{{contractor_reg_no}}</td></tr>
      <tr><th>대표자</th><td>{{contractor_rep}}</td><th>연락처</th><td>{{contractor_phone}}</td></tr>
      <tr><th>사업장 주소</th><td colspan="3">{{contractor_address}}</td></tr></table>
    <table style="margin-top:10px"><colgroup><col style="width:18%"><col style="width:82%"></colgroup>
      <tr><th>옥외광고물 종류</th><td class="chk">□ 간판 &nbsp;&nbsp; □ LED전광판 &nbsp;&nbsp; □ 기타(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr>
      <tr><th>비대상 근거</th><td class="chk">□ 신고(허가) 대상의 사이즈 및 광고물이 아닐 경우<br>□ 간판 내부의 LED만 교체했을 경우<br>□ 기타(하단 근거 필수기재) (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td></tr></table>
    <p class="stmt">※ 옥외광고물 제작 업체의 옥외광고업 등록증 사본 1부 별도 첨부<br>
      위 사업자의 설치 옥외광고물은 「옥외광고물 등 관리법」 제3조 제1항 및 동법 시행령 제7조 제1항(제9조 제1항)에 따라 신고(허가) 대상이 아님을 확인하며, 무허가 옥외광고물(간판, 전기류 등) 설치로 인한 문제 발생 시 조치할 것을 확약합니다.<br>
      ※ 전기를 이용하는 광고물(네온류, 전광류 등 포함)은 신고(허가)대상 또한 대전광역시 옥외광고물 등의 관리와 옥외광고산업 진흥에 관한 조례를 준수함을 확약합니다.</p>
    <table class="signrow"><tr><td>신청업체(대표자)<br>{{owner_name}} (인)</td><td>외주업체 대표<br>{{contractor_rep}} (인)</td></tr></table>
    <div class="foot">{{today}} &nbsp; · &nbsp; {{institution}} 귀하</div>
  </body></html>$html$, '{}'::jsonb)
on conflict (template_key) do update set
  name = excluded.name, attachment_no = excluded.attachment_no, html_content = excluded.html_content;

-- 붙임10 · 영상정보처리기기 운영·관리 방침 (신규)
insert into public.document_templates (template_key, name, attachment_no, html_content, field_mapping)
values ('cctv_policy', '영상정보처리기기 운영·관리 방침 (붙임10)', '붙임10',
  $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:16mm 14mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.6}
    h1{text-align:center;font-size:16px;margin:4px 0 14px}
    h2{font-size:13px;margin:14px 0 4px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;text-align:left;word-break:break-all}
    th{background:#eef2f7;text-align:center}.chk{letter-spacing:1px}
    .stmt{margin-top:12px;font-size:11px}
    .sign{margin-top:16px;text-align:center;line-height:2}
    .foot{margin-top:6px;text-align:center;font-weight:600}
  </style></head><body>
    <h1>대전 소상공인·자영업자 재기지원사업 경영개선지원<br>영상정보처리기기 운영·관리 방침</h1>
    <h2>1. 지원업체 현황</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td>{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td>{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td>{{owner_name}}</td><th>연락처</th><td>{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td colspan="3">{{address}}</td></tr></table>
    <h2>2. 영상정보처리기기 운영·관리 방침</h2>
    <table><colgroup><col style="width:24%"><col style="width:76%"></colgroup>
      <tr><th>설치목적</th><td class="chk">□ 시설안전 및 화재 예방 &nbsp;&nbsp; □ 고객 안전 및 범죄 예방</td></tr>
      <tr><th>설치장소</th><td></td></tr>
      <tr><th>설치대수</th><td></td></tr>
      <tr><th>촬영범위</th><td></td></tr>
      <tr><th>촬영시간</th><td></td></tr>
      <tr><th>관리책임자<br><span style="font-weight:400;font-size:10px">*위탁계약 시 수탁업체 담당자</span></th><td></td></tr>
      <tr><th>연락처<br><span style="font-weight:400;font-size:10px">*위탁계약 시 수탁업체 담당자</span></th><td></td></tr></table>
    <p class="stmt">※ CCTV 안내판 필수 설치 및 사진 제출 (기재내용 : 설치 목적·장소·범위, 촬영시간, 책임자 성명·연락처)<br>
      위 사업자는 「개인정보 보호법」 제25조에 따라 영상정보처리기기를 설치·운영하고 있으며, 개인영상정보의 무단 유출 및 공개를 금지(동법 제18조)하고, 개인영상정보에 관하여 열람 또는 존재 확인·삭제를 요구한 경우 필요한 조치를 하겠습니다(동법 제35조 및 제36조). 또한 기록된 영상정보를 안전하게 관리(동법 제25조 및 제29조)하고 개인정보 처리 운영방침을 수립·공개(동법 제30조)할 것을 확약합니다.</p>
    <div class="sign">{{today}}<br>신청업체(대표자) {{owner_name}} (인)</div>
    <div class="foot">{{institution}} 귀하</div>
  </body></html>$html$, '{}'::jsonb)
on conflict (template_key) do update set
  name = excluded.name, attachment_no = excluded.attachment_no, html_content = excluded.html_content;

-- 붙임7 · 경영개선 완료보고서 및 지원금 신청서 (원문 상세로 교체)
update public.document_templates set
  name = '경영개선지원 완료보고서·지원금 신청서 (붙임7)', attachment_no = '붙임7',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 12mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.5}
    .att{font-size:12px;color:#333}
    h1{text-align:center;font-size:17px;margin:6px 0 14px}
    h2{font-size:13px;margin:14px 0 5px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;word-break:break-all}
    th{background:#eef2f7;font-weight:600;text-align:center}
    .l{text-align:left}.chk{letter-spacing:2px}.note{font-size:11px;color:#444}
    .photo{height:60px;text-align:center;color:#999;font-size:11px}
    .pledge{margin-top:14px;font-size:11px;line-height:1.6}
    .signrow{margin-top:12px;width:100%;border-collapse:collapse}
    .signrow td{border:1px solid #555;padding:8px;text-align:center}
    .foot{margin-top:10px;text-align:center;font-weight:600}
  </style></head><body>
    <div class="att">붙임7</div>
    <h1>대전 소상공인·자영업자 재기지원사업<br>경영개선지원 완료보고서 및 지원금 신청서</h1>
    <h2>1. 지원업체 현황</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td class="l">{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td class="l">{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td class="l">{{owner_name}}</td><th>대표자 연락처</th><td class="l">{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td class="l" colspan="3">{{address}}</td></tr>
      <tr><th>추천인<br>(컨설턴트)</th><td class="l">{{consultant_name}}</td><th>컨설턴트 연락처</th><td class="l">{{consultant_phone}}</td></tr></table>
    <h2>2. 지원금 신청사항</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>총 신청내역</th><td class="l chk" colspan="3">□ 위생관리 &nbsp; □ 안전관리 &nbsp; □ 홍보(광고) &nbsp; □ 환경개선 &nbsp; □ POS경비</td></tr>
      <tr><th>총소요비용</th><td class="l" colspan="3" style="background:#fafafa">※ 지원금 최대 300만원 / 심의 시 지원금액은 하향 조정될 수 있음</td></tr>
      <tr><th>소요금액 합계<br>(부가세 제외)</th><td class="l">{{cost_excl_vat}} 원</td><th>지원금 신청액<br>(소요금액의 100%)</th><td class="l">{{amount}} 원</td></tr>
      <tr><th>지급처</th><td class="l" colspan="3" style="background:#fafafa">※ 반드시 대표자(또는 법인) 본인 명의 통장 기재(불일치 시 지급 불가)</td></tr>
      <tr><th>은행명</th><td class="l">{{bank_name}}</td><th>예금주</th><td class="l">{{account_holder}}</td></tr>
      <tr><th>계좌번호</th><td class="l">{{account_number}}</td><th>신청금액</th><td class="l">{{amount}} 원</td></tr>
      <tr><th>시공·제작<br>완료사항</th><td class="l" colspan="3">외주업체 : {{contractor_name}} &nbsp; / 소요금액(부가세 제외) : {{contractor_amount}}</td></tr></table>
    <h2>3. 지원사업 결과물</h2>
    <table><colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>단위사업</th><td class="l chk" colspan="3">□ 위생관리 &nbsp; □ 안전관리 &nbsp; □ 홍보(광고) &nbsp; □ 환경개선 &nbsp; □ POS경비</td></tr>
      <tr><th>외주 업체명<br>(업체 지역)</th><td class="l">{{contractor_name}}</td><th>사업자등록번호</th><td class="l">{{contractor_reg_no}}</td></tr>
      <tr><th>대표자명</th><td class="l">{{contractor_rep}}</td><th>업태/종목</th><td class="l">{{contractor_work_type}}</td></tr>
      <tr><th>사업장 연락처</th><td class="l">{{contractor_phone}}</td><th>시공기간</th><td class="l"></td></tr>
      <tr><th>개선 전</th><td class="photo">(사진 첨부)</td><th>개선 후</th><td class="photo">(사진 첨부)</td></tr></table>
    <p class="pledge">신청인과 외주업체는 「대전 소상공인·자영업자 재기지원사업(컨설팅·경영개선)」에 참여·수행함에 있어 관련 의무사항을 성실히 이행하며, 불이행 시 규정에 따른 불이익(사업 참여 제한·지원금 환수 등)을 감수할 것을 확약합니다.</p>
    <table class="signrow"><tr><td>신청업체(대표자)<br>{{owner_name}} (인)</td><td>외주업체 대표<br>{{contractor_rep}} (인)</td><td>컨설턴트<br>{{consultant_name}} (인)</td></tr></table>
    <p class="note" style="margin-top:8px">첨부서류(필수) : 통장사본(대표자 명의), 외주업체 사업자등록증 사본, 전자세금계산서, 하자보증이행각서, 지출 증빙자료(계좌이체 입금증 또는 이체·송금 확인증)<br>(해당 시) 옥외광고물 등 표시 신고증명서 또는 표시 신고(허가) 비대상 확인서, 영상정보처리기기 운영·관리 방침</p>
    <div class="foot">{{today}} &nbsp; · &nbsp; {{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'payment_application_management';
