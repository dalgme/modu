-- ============================================================================
-- 0008_faithful_templates.sql
-- 붙임서식 HTML 템플릿을 실제 hwp 원본 레이아웃대로 재작성.
--  - 붙임5  경영개선지원 신청서            (support_application_management)
--  - 붙임1  폐업정리 사업신청서            (support_application_closure)
--  - 붙임7  경영개선 완료보고서·지원금신청 (payment_application_management)
--  - 붙임4  폐업정리 완료보고서·지원금신청 (payment_application_closure)
--  - (신규) 컨설팅 결과보고서             (consulting_result_report)
-- {{placeholder}} 는 케이스/멘토링 데이터로 런타임 치환.
-- ============================================================================

-- 공통 스타일은 각 템플릿 head 에 인라인. (PDF 렌더 시 외부 CSS 미사용)

-- ---------------------------------------------------------------------------
-- 붙임5 · 경영개선지원 신청서
-- ---------------------------------------------------------------------------
update public.document_templates set
  name = '경영개선지원 신청서 (붙임5)',
  attachment_no = '붙임5',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 12mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.5}
    .att{font-size:12px;color:#333}
    h1{text-align:center;font-size:19px;margin:6px 0 16px}
    h2{font-size:13px;margin:16px 0 6px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;vertical-align:middle;word-break:break-all}
    th{background:#eef2f7;font-weight:600;text-align:center}
    .l{text-align:left}.c{text-align:center}.chk{letter-spacing:2px}
    .sign{margin-top:24px;text-align:center;line-height:2}
    .foot{margin-top:8px;text-align:center;font-weight:600}
  </style></head><body>
    <div class="att">붙임5</div>
    <h1>대전 소상공인·자영업자 재기지원사업 경영개선지원 신청서</h1>

    <h2>1. 지원업체 현황</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td class="l">{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td class="l">{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td class="l">{{owner_name}}</td><th>연락처</th><td class="l">{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td class="l" colspan="3">{{address}}</td></tr>
      <tr><th>상시근로자<br>(대표자 제외)</th><td class="l">{{employee_count}} 명</td><th>개업연월일</th><td class="l">{{opened_at}}</td></tr>
      <tr><th>업 태</th><td class="l">{{business_type}}</td><th>종 목</th><td class="l">{{item}}</td></tr>
    </table>

    <h2>2. 컨설팅</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>성 명<br>(컨설턴트)</th><td class="l">{{consultant_name}}</td><th>연락처<br>(컨설턴트)</th><td class="l">{{consultant_phone}}</td></tr>
      <tr><th>컨설팅일자</th><td class="l" colspan="3">(1차) {{consulting_date_1}} &nbsp; (2차) {{consulting_date_2}} &nbsp; (3차) {{consulting_date_3}}</td></tr>
    </table>

    <h2>3. 경영개선자금 신청내역</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:82%"></colgroup>
      <tr><th>총 신청내역</th><td class="l chk">□ 위생관리 &nbsp; □ 안전관리 &nbsp; □ 홍보(광고) &nbsp; □ 환경개선 &nbsp; □ POS경비</td></tr>
      <tr><th>총소요비용</th><td class="l">※ 지원금 최대 300만원 (부가가치세는 자부담)</td></tr>
      <tr><th>소요금액<br>(부가세 제외)</th><td class="l">{{requested_amount}} 원</td></tr>
      <tr><th>지원금신청액<br>(소요금액의 100%)</th><td class="l">{{requested_amount}} 원</td></tr>
      <tr><th>시공(제작)<br>내용</th><td class="l">{{reason}}</td></tr>
    </table>

    <h2>4. 시공(제작) 내용</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>단위사업</th><td class="l chk" colspan="3">□ 위생관리 &nbsp; □ 안전관리 &nbsp; □ 홍보(광고) &nbsp; □ 환경개선 &nbsp; □ POS경비</td></tr>
      <tr><th>외주 업체명<br>(업체 지역)</th><td class="l">{{contractor_name}}</td><th>사업자등록번호</th><td class="l">{{contractor_reg_no}}</td></tr>
      <tr><th>대표자명</th><td class="l">{{contractor_rep}}</td><th>업태/종목</th><td class="l">{{contractor_work_type}}</td></tr>
      <tr><th>사업장 연락처</th><td class="l">{{contractor_phone}}</td><th>휴대전화</th><td class="l"></td></tr>
      <tr><th>시공기간</th><td class="l"></td><th>소요금액</th><td class="l">{{contractor_amount}}</td></tr>
      <tr><th>시공내용</th><td class="l" colspan="3">{{contractor_work_type}}</td></tr>
    </table>

    <div class="sign">
      위와 같이 경영개선지원을 신청합니다.<br>
      신청일 : {{application_date}}<br>
      업체명 : {{business_name}} &nbsp;&nbsp; 대표 : {{owner_name}} (인)
    </div>
    <div class="foot">{{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'support_application_management';

-- ---------------------------------------------------------------------------
-- 붙임1 · 폐업정리 사업신청서
-- ---------------------------------------------------------------------------
update public.document_templates set
  name = '폐업정리 사업신청서 (붙임1)',
  attachment_no = '붙임1',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 12mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.5}
    .att{font-size:12px;color:#333}
    h1{text-align:center;font-size:19px;margin:6px 0 16px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:7px 8px;word-break:break-all}
    th{background:#eef2f7;font-weight:600;text-align:center;width:18%}
    .l{text-align:left}.chk{letter-spacing:2px}
    .stmt{margin-top:18px;font-size:12px}
    .sign{margin-top:14px;text-align:center;line-height:2}
    .foot{margin-top:8px;text-align:center;font-weight:600}
  </style></head><body>
    <div class="att">붙임1</div>
    <h1>대전 소상공인·자영업자 재기지원(폐업정리) 신청서</h1>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>업 체 명</th><td class="l">{{business_name}}</td><th>대 표 자</th><td class="l">{{owner_name}}</td></tr>
      <tr><th>사업자등록번호</th><td class="l">{{business_reg_no}}</td><th>대표 휴대번호</th><td class="l">{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td class="l" colspan="3">{{address}}</td></tr>
      <tr><th>이 메 일</th><td class="l" colspan="3">{{email}}</td></tr>
      <tr><th>업 태</th><td class="l">{{business_type}}</td><th>종 목</th><td class="l">{{item}}</td></tr>
      <tr><th>신 청 구 분</th><td class="l chk">{{closure_closed}} 폐업 &nbsp;&nbsp; {{closure_pending}} 폐업예정</td><th>개업연월일</th><td class="l">{{opened_at}}</td></tr>
      <tr><th>폐업(예정)연월일</th><td class="l">{{closed_at}}</td><th>근로자수<br>(신청일 기준)</th><td class="l">{{employee_count}} 명</td></tr>
      <tr><th>매출액(2025년)</th><td class="l">{{revenue_last_year}} 원</td><th>임대차보증금</th><td class="l">{{lease_deposit}} 원</td></tr>
      <tr><th>월세금액</th><td class="l" colspan="3">{{monthly_rent}} 원</td></tr>
    </table>
    <p class="stmt">위와 같이 「대전 소상공인·자영업자 재기지원(폐업정리)」 신청서를 제출하며, 작성한 내용에 허위 사실이 없음을 확인합니다.</p>
    <div class="sign">
      신청일 : {{application_date}}<br>
      업체명 : {{business_name}} &nbsp;&nbsp; 대표 : {{owner_name}} (인)
    </div>
    <div class="foot">{{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'support_application_closure';

-- ---------------------------------------------------------------------------
-- 붙임7 · 경영개선 완료보고서 및 지원금 신청서
-- ---------------------------------------------------------------------------
update public.document_templates set
  name = '경영개선 완료보고서·지원금 신청서 (붙임7)',
  attachment_no = '붙임7',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 12mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.5}
    .att{font-size:12px;color:#333}
    h1{text-align:center;font-size:18px;margin:6px 0 16px}
    h2{font-size:13px;margin:16px 0 6px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;word-break:break-all}
    th{background:#eef2f7;font-weight:600;text-align:center}
    .l{text-align:left}.chk{letter-spacing:2px}
    .note{font-size:11px;color:#444}
    .sign{margin-top:20px;text-align:center;line-height:2}
    .foot{margin-top:8px;text-align:center;font-weight:600}
  </style></head><body>
    <div class="att">붙임7</div>
    <h1>대전 소상공인·자영업자 재기지원(경영개선)<br>완료보고서 및 지원금 신청서</h1>

    <h2>1. 지원업체 현황</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td class="l">{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td class="l">{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td class="l">{{owner_name}}</td><th>대표자 연락처</th><td class="l">{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td class="l" colspan="3">{{address}}</td></tr>
      <tr><th>추천인<br>(컨설턴트)</th><td class="l">{{consultant_name}}</td><th>컨설턴트 연락처</th><td class="l">{{consultant_phone}}</td></tr>
    </table>

    <h2>2. 지원금 신청사항</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>총소요비용</th><td class="l" colspan="3" style="background:#fafafa">※ 지원금 최대 300만원 (부가가치세는 자부담)</td></tr>
      <tr><th>소요금액<br>(부가세 제외)</th><td class="l">{{cost_excl_vat}} 원</td><th>지원금 신청액</th><td class="l">{{amount}} 원</td></tr>
      <tr><th>지급처</th><td class="l" colspan="3" style="background:#fafafa">※ 반드시 대표자(또는 법인) 본인 명의 통장 기재(불일치 시 지급 불가)</td></tr>
      <tr><th>은행명</th><td class="l">{{bank_name}}</td><th>예금주</th><td class="l">{{account_holder}}</td></tr>
      <tr><th>계좌번호</th><td class="l">{{account_number}}</td><th>신청금액</th><td class="l">{{amount}} 원</td></tr>
      <tr><th>시공완료<br>사항</th><td class="l" colspan="3">외주업체 : {{contractor_name}} &nbsp; / 소요금액(부가세 제외) : {{contractor_amount}}</td></tr>
    </table>
    <p class="note">※ 완료보고서 제출기한 : {{report_due_date}} (선정통보 후 3개월 이내)</p>

    <div class="sign">
      위와 같이 완료보고 및 지원금 지급을 신청합니다.<br>
      신청일 : {{application_date}} &nbsp;&nbsp; 신청업체(대표자) : {{owner_name}} (인)
    </div>
    <div class="foot">{{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'payment_application_management';

-- ---------------------------------------------------------------------------
-- 붙임4 · 폐업정리 완료보고서 및 지원금 신청서
-- ---------------------------------------------------------------------------
update public.document_templates set
  name = '폐업정리 완료보고서·지원금 신청서 (붙임4)',
  attachment_no = '붙임4',
  html_content = $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 12mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.5}
    .att{font-size:12px;color:#333}
    h1{text-align:center;font-size:18px;margin:6px 0 16px}
    h2{font-size:13px;margin:16px 0 6px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;word-break:break-all}
    th{background:#eef2f7;font-weight:600;text-align:center}
    .l{text-align:left}.chk{letter-spacing:2px}
    .note{font-size:11px;color:#444}
    .photo{height:70px;text-align:center;color:#999;font-size:11px}
    .pledge{margin-top:16px;font-size:11px;line-height:1.6}
    .signrow{margin-top:12px;width:100%;border-collapse:collapse}
    .signrow td{border:1px solid #555;padding:8px;text-align:center}
    .foot{margin-top:10px;text-align:center;font-weight:600}
  </style></head><body>
    <div class="att">붙임4</div>
    <h1>대전 소상공인·자영업자 재기지원(폐업정리)<br>완료보고서 및 지원금 신청서</h1>

    <h2>1. 지원업체 현황</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>상 호 명</th><td class="l">{{business_name}}</td><th>사업자등록번호<br>(법인등록번호)</th><td class="l">{{business_reg_no}}</td></tr>
      <tr><th>대표자</th><td class="l">{{owner_name}}</td><th>대표자 연락처</th><td class="l">{{phone}}</td></tr>
      <tr><th>사업장 주소</th><td class="l" colspan="3">{{address}}</td></tr>
      <tr><th>추천인<br>(컨설턴트)</th><td class="l">{{consultant_name}}</td><th>컨설턴트 연락처</th><td class="l">{{consultant_phone}}</td></tr>
    </table>

    <h2>2. 지원금 신청사항</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>총소요비용</th><td class="l" colspan="3" style="background:#fafafa">※ 지원금 최대 500만원 / 전용면적(3.3㎡)당 20만원 이내로 제한</td></tr>
      <tr><th>소요금액<br>(부가세 제외)</th><td class="l">{{cost_excl_vat}} 원</td><th>지원금 신청액</th><td class="l">{{amount}} 원</td></tr>
      <tr><th>지급처</th><td class="l" colspan="3" style="background:#fafafa">※ 반드시 대표자(또는 법인) 본인 명의 통장 기재(불일치 시 지급 불가)</td></tr>
      <tr><th>은행명</th><td class="l">{{bank_name}}</td><th>예금주</th><td class="l">{{account_holder}}</td></tr>
      <tr><th>계좌번호</th><td class="l">{{account_number}}</td><th>신청금액</th><td class="l">{{amount}} 원</td></tr>
      <tr><th>시공완료<br>사항</th><td class="l chk" colspan="3">□ 점포철거 &nbsp;&nbsp; □ 원상복구 &nbsp;&nbsp; / 업체명 : {{contractor_name}} &nbsp; 소요금액 : {{contractor_amount}}</td></tr>
    </table>

    <h2>3. 지원사업 결과물</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>외주 업체명<br>(업체 지역)</th><td class="l">{{contractor_name}}</td><th>사업자등록번호</th><td class="l">{{contractor_reg_no}}</td></tr>
      <tr><th>대표자명</th><td class="l">{{contractor_rep}}</td><th>업태/종목</th><td class="l">{{contractor_work_type}}</td></tr>
      <tr><th>사업장 연락처</th><td class="l">{{contractor_phone}}</td><th>시공기간</th><td class="l"></td></tr>
      <tr><th>시공 전</th><td class="photo">(사진 첨부)</td><th>시공 후</th><td class="photo">(사진 첨부)</td></tr>
    </table>

    <p class="pledge">신청인과 외주업체는 「대전 소상공인·자영업자 재기지원(폐업정리)」에 참여·수행함에 있어 관련 의무사항을 성실히 이행하며, 불이행 시 규정에 따른 불이익(사업 참여 제한·지원금 환수 등)을 감수할 것을 확약합니다.</p>
    <table class="signrow">
      <tr><td>신청업체(대표자)<br>{{owner_name}} (인)</td><td>컨설턴트<br>{{consultant_name}} (인)</td><td>외주업체 대표<br>{{contractor_rep}} (인)</td></tr>
    </table>
    <p class="note" style="margin-top:8px">첨부서류 : 공사내역서, 전자세금계산서, 계좌이체 입금증(또는 이체·송금 확인증), 통장사본(대표자 명의), 외주업체 사업자등록증 사본</p>
    <div class="foot">신청일 : {{application_date}} &nbsp; · &nbsp; {{institution}} 귀하</div>
  </body></html>$html$
where template_key = 'payment_application_closure';

-- ---------------------------------------------------------------------------
-- (신규) 컨설팅 결과보고서
-- ---------------------------------------------------------------------------
insert into public.document_templates (template_key, name, attachment_no, html_content, field_mapping)
values (
  'consulting_result_report',
  '컨설팅 결과보고서',
  null,
  $html$<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm 12mm}
    body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111;font-size:12px;line-height:1.5}
    h1{text-align:center;font-size:18px;margin:6px 0 16px}
    h2{font-size:13px;margin:16px 0 6px;border-left:4px solid #333;padding-left:6px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{border:1px solid #555;padding:6px 8px;word-break:break-all;vertical-align:top}
    th{background:#eef2f7;font-weight:600;text-align:center}
    .l{text-align:left}
    .box{min-height:64px}
    .photo{height:150px;text-align:center;color:#999;font-size:11px}
  </style></head><body>
    <h1>대전 소상공인·자영업자 재기지원사업 컨설팅 결과보고서</h1>
    <table>
      <colgroup><col style="width:18%"><col style="width:32%"><col style="width:18%"><col style="width:32%"></colgroup>
      <tr><th>업 체 명</th><td class="l">{{business_name}}</td><th>대 표 자</th><td class="l">{{owner_name}}</td></tr>
      <tr><th>일 시</th><td class="l">{{visited_at}}</td><th>장 소</th><td class="l">{{place}}</td></tr>
      <tr><th>컨설팅주제</th><td class="l">{{topic}}</td><th>컨설턴트</th><td class="l">{{consultant_name}} (인)</td></tr>
    </table>

    <h2>1. 컨설팅</h2>
    <table>
      <colgroup><col style="width:18%"><col style="width:82%"></colgroup>
      <tr><th>기업 애로사항 등</th><td class="l box">{{difficulties}}</td></tr>
      <tr><th>컨설팅 내용</th><td class="l box">{{content}}</td></tr>
      <tr><th>컨설팅 결과</th><td class="l box">{{result}}</td></tr>
    </table>

    <h2>2. 현장사진</h2>
    <table>
      <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
      <tr><th>사진1</th><th>사진2</th></tr>
      <tr><td class="photo">(현장사진 첨부)</td><td class="photo">(현장사진 첨부)</td></tr>
    </table>
    <p style="text-align:right;margin-top:14px">작성일 : {{report_date}}</p>
  </body></html>$html$,
  '{}'::jsonb
)
on conflict (template_key) do update set
  name = excluded.name,
  html_content = excluded.html_content,
  attachment_no = excluded.attachment_no;
