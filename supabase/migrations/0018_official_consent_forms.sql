-- 공식 공고문(2026 대전 소상공인·자영업자 재기지원 컨설팅·경영개선) 붙임서식과 일치하도록
-- 개인정보 수집·이용 및 제공 동의서 / 행정정보 공동이용 사전동의서 를 공식 레이아웃대로 재작성.

-- ── 개인정보 수집·이용 및 제공 동의서 (공식 붙임3) ──────────────────────────
update public.document_templates set
  name = '개인정보 수집·이용 및 제공 동의서',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:16mm 15mm}
    body{color:#111;font-size:12.5px;line-height:1.55}
    h1{text-align:center;font-size:18px;margin:0 0 16px;letter-spacing:1px}
    .box{border:1.2px solid #222;padding:10px 12px;margin:10px 0}
    .box>.tit{font-weight:700;font-size:13px;margin:0 0 6px}
    .lv1{margin:5px 0 2px;font-weight:600}
    .lv2{margin:0 0 3px 12px;color:#222}
    .agree{margin:8px 0 2px;font-weight:700}
    .stmt{margin:16px 0 6px;text-align:justify}
    .sign{margin-top:10px;text-align:center;line-height:2.1}
    .foot{margin-top:6px;text-align:center;font-weight:700}
  </style></head><body>
    <h1>개인정보 수집·이용 및 제공 동의서</h1>

    <div class="box">
      <p class="tit">□ 개인정보 수집 및 이용 동의</p>
      <p class="lv1">○ 개인정보의 수집 및 이용목적</p>
      <p class="lv2">- 「대전 소상공인·자영업자 재기지원」 사업의 운영 및 관리를 위한 이용</p>
      <p class="lv1">○ 수집 및 이용하는 개인정보의 항목</p>
      <p class="lv2">- 성명, 연락처, 사업자등록번호, 사업장 소재지, E-mail 등</p>
      <p class="lv1">○ 개인정보의 보유 및 이용 기간</p>
      <p class="lv2">- 위 개인정보는 수집·이용에 관한 동의 일로부터 보유목적 달성 시 또는 정보주체가 개인정보 삭제를 요청할 경우 지체 없이 파기</p>
      <p class="lv2">- 개인정보의 보존기간은 5년으로 하며, 사업이 종료된 후에는 향후 지원 사업 신청 시의 이력 관리만을 위하여 보유·이용</p>
      <p class="lv1">○ 동의를 거부할 권리 및 동의를 거부할 경우의 불이익</p>
      <p class="lv2">- 위 개인정보 수집·이용에 관한 동의는 본 사업의 수행을 위해 필수적이므로 이에 동의하여야 이후 절차를 진행할 수 있으며, 동의를 하지 않을 경우 사업 신청을 할 수 없음</p>
      <p class="agree">본인은 개인정보 수집 및 이용에 동의합니다. &nbsp;&nbsp; □ 동의 &nbsp;&nbsp; □ 동의하지 않음</p>
    </div>

    <div class="box">
      <p class="tit">□ 개인정보 제3자 제공 동의</p>
      <p class="lv1">○ 개인정보를 제공받는 자</p>
      <p class="lv2">- 대전광역시, 대전일자리경제진흥원, 「대전 소상공인·자영업자 재기지원」 협업기관 등</p>
      <p class="lv1">○ 제공받는 자의 이용 목적</p>
      <p class="lv2">- 「대전 소상공인·자영업자 재기지원」의 운영 및 관리를 위한 이용</p>
      <p class="lv1">○ 제공할 개인정보의 항목</p>
      <p class="lv2">- 수집·이용에 동의한 정보 중 업무 목적 달성을 위해 필요한 정보</p>
      <p class="lv1">○ 제공받는 자의 보유 및 이용기간</p>
      <p class="lv2">- 위 개인정보의 보존기간은 5년으로 하며, 제공된 날로부터 보유·이용되며 보유목적 달성 시 또는 정보주체가 개인정보 삭제를 요청할 경우 지체 없이 파기</p>
      <p class="lv1">○ 동의를 거부할 권리 및 동의를 거부할 경우의 불이익</p>
      <p class="lv2">- 위 개인정보 제공에 관한 동의는 거부할 수 있으며, 동의를 거부 시 사업 신청을 할 수 없음</p>
      <p class="agree">본인은 개인정보 제공에 동의합니다. &nbsp;&nbsp; □ 동의 &nbsp;&nbsp; □ 동의하지 않음</p>
    </div>

    <p class="stmt">본인은 「개인정보 보호법」 제15조, 제17조, 제24조 등에 의거하여 「대전 소상공인·자영업자 재기지원」과 관련된 본인의 개인정보 수집 및 이용에 동의하고, 수집된 개인정보를 원활한 지원 사업 추진을 위해 제3자에게 제공하는 것에 동의합니다.</p>

    <div class="sign">{{today}}<br>업체명 : {{business_name}} &nbsp;&nbsp; 대표 : {{owner_name}} {{{sign_applicant}}}</div>
    <div class="foot">대전일자리경제진흥원장 귀하</div>
  </body></html>$html$
where template_key = 'consent_privacy';

-- ── 행정정보 공동이용 사전동의서 (공식 붙임4 · [별지 제8호서식]) ──────────────
update public.document_templates set
  name = '행정정보 공동이용 사전동의서',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>@page{size:A4;margin:18mm 16mm}body{color:#000;font-size:13.5px;line-height:1.6}.form-no{font-weight:700;font-size:11px;margin:0 0 10px}h1{text-align:center;font-size:21px;font-weight:800;margin:2px 0 18px;letter-spacing:2px}table{border-collapse:collapse;width:100%;margin:6px 0;table-layout:fixed}col.k{width:42%}th,td{border:1px solid #000;padding:7px 11px;vertical-align:middle;font-weight:400}th{text-align:left;background:#fff}td{text-align:left}th .sub{font-size:11px;color:#000}.stmt{margin:16px 0 6px;text-align:justify}.note{margin:6px 0;text-align:justify}.rrn td{height:30px}.sign{margin-top:34px;line-height:2.5;text-align:right}.sign .date{text-align:center;letter-spacing:1px;margin-bottom:6px}.sign .who{padding-right:20px}.foot{margin-top:22px;text-align:left;font-weight:800;font-size:15px}</style></head><body><p class="form-no">■ 행정정보 공동이용 지침 [별지 제8호서식]</p><h1>행정정보 공동이용 사전동의서</h1><table><colgroup><col class="k"><col></colgroup><tr><th>이용기관 명칭</th><td>대전광역시, 대전일자리경제진흥원</td></tr><tr><th>이용사무(이용목적)</th><td>대전 소상공인·자영업자 재기지원사업</td></tr><tr><th>공동이용 행정정보 보유ㆍ이용 기간<br><span class="sub">(주기적으로 정보를 조회하는 경우 조회 기간·주기 명시)</span></th><td>최대 5년</td></tr><tr><th>행정정보 공동이용을 위해 제공하는 정보</th><td>성명, 주민등록번호, 고유식별번호 등</td></tr><tr><th>공동이용 행정정보(첨부서류)</th><td>사업자등록증명, 중소기업확인서,<br>건강보험자격득실확인서,<br>부가가치세과세표준증명,<br>부가가치세면세사업자수입금액증명,<br>(국세)납세증명서, 지방세납세증명서,<br>일반건축물대장</td></tr></table><p class="stmt">본인은 위 사무의 처리를 위하여 「전자정부법」 제36조에 따른 행정정보의 공동이용을 통하여 이용기관의 업무처리담당자가 전자적으로 본인의 공동이용 행정정보(첨부서류)를 확인하는 것에 동의합니다.</p><p class="note">※ 행정정보의 공동이용에 대하여 동의하지 아니할 경우에도 불이익은 없으며, 동의하지 아니한 경우 본인이 해당 첨부서류를 직접 제출하여야 합니다.</p><p class="note">이용기관은 본인이 동의한 위 공동이용 행정정보를 확인하기 위해 「전자정부법 시행령」 제90조에 따라 주민등록번호, 여권번호, 운전면허의 면허번호 또는 외국인등록번호가 포함된 행정정보를 처리할 수 있습니다. 이용기관이 요청하는 경우 기재하여 주십시오.</p><table class="rrn"><colgroup><col class="k"><col></colgroup><tr><th>주민등록번호(전체 13자리) 기재</th><td>&nbsp;&nbsp;-</td></tr></table><div class="sign"><p class="date">{{today}}</p><p class="who">대상자(본인) &nbsp;&nbsp; 성 명 : {{owner_name}} &nbsp; {{{sign_applicant}}} &nbsp;</p><p class="who">전화번호 : {{phone}} &nbsp;</p></div><p class="foot">대전일자리경제진흥원장 귀하</p></body></html>$html$
where template_key = 'consent_admin_info';
