-- ============================================================================
-- 0016_form5_full_layout.sql
-- 붙임5 경영개선지원 신청서를 공식 패킷 원본 구조로 완성.
-- 기존(1~4 + 단일 서명) → 1.지원업체현황 2.컨설팅 3.신청내역 4.시공내용
--   + 5.추진계획 6.사업장 사진 + 확인문구 + 2자 서명(신청업체·컨설턴트) + 첨부서류.
-- 서명 플레이스홀더({{{sign_applicant}}}/{{{sign_consultant}}}) 유지.
-- ============================================================================
update public.document_templates set
  name = '경영개선지원 신청서 (붙임5)', attachment_no = '붙임5',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 12mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.5}
    .att{font-size:12px;color:#333}
    h1{text-align:center;font-size:18px;margin:6px 0 14px}
    h2{font-size:13px;margin:14px 0 5px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;vertical-align:middle;word-break:break-all}
    th{background:#eef2f7;font-weight:600;text-align:center}
    .l{text-align:left}.chk{letter-spacing:2px}
    .box td,td.box{height:46px;vertical-align:top;text-align:left}
    .photo{height:120px;text-align:center;color:#999;font-size:11px;vertical-align:middle}
    .note{font-size:11px;color:#444}
    .stmt{margin-top:12px;font-size:12px;line-height:1.7}
    .sign{margin-top:16px;text-align:center;line-height:2}
    .foot{margin-top:6px;text-align:center;font-weight:600}
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
      <tr><th>사업장 연락처</th><td class="l">{{contractor_phone}}</td><th>시공기간</th><td class="l"></td></tr>
      <tr><th>시공내용</th><td class="l" colspan="3">{{contractor_work_type}}</td></tr></table>
    <p class="note">* 외주업체가 복수인 경우 필요시 칸을 추가 기재</p>
    <h2>5. 추진계획</h2>
    <table><colgroup><col style="width:18%"><col style="width:82%"></colgroup>
      <tr><th>사업소개</th><td class="box"></td></tr>
      <tr><th>경영상황</th><td class="box"></td></tr>
      <tr><th>지원 필요성</th><td class="box"></td></tr>
      <tr><th>기대효과</th><td class="box"></td></tr></table>
    <h2>6. 사업장 사진</h2>
    <p class="note">* 현재 사업장 내·외부 사진(간판이 보이게 촬영), 시공할 장소 사진 (수혜대상 대표자 확인)</p>
    <table><colgroup><col style="width:50%"><col style="width:50%"></colgroup>
      <tr><td class="photo">(사업장 사진 첨부)</td><td class="photo">(사업장 사진 첨부)</td></tr></table>
    <p class="stmt">▶ 본 참여 신청서 및 공고문의 내용을 모두 확인하고 본인이 직접 서명함을 확인합니다.<br>▶ 서류 누락 또는 공고문 내용을 위반하는 경우 지원 탈락으로 간주함에 동의합니다.</p>
    <div class="sign">신청일 : {{application_date}}<br>신청업체(대표자) : {{owner_name}} {{{sign_applicant}}} &nbsp;&nbsp; 컨설턴트 : {{consultant_name}} {{{sign_consultant}}}</div>
    <div class="foot">{{institution}} 귀하</div>
    <p class="note" style="margin-top:8px">첨부서류(필수) : 외주업체 사업자등록증 사본 1부, 견적서 1부(100만원 이상일 경우 견적서 2개 이상), 사업참여 및 중복지원 금지 확약서<br>(해당 시) 옥외광고업 등록증</p>
  </body></html>$html$
where template_key = 'support_application_management';
