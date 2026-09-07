대전 재기지원사업 플랫폼 — 클로드 코드 단계별 프롬프트

총 15단계 순차 진행 · 각 단계 완료 후 commit

사용법: 설계 문서(.docx)를 클로드 코드 세션에 첨부하고, CLAUDE.md를 프로젝트 루트에 저장한 뒤, 아래 프롬프트를 1단계부터 순서대로 복사해 붙여넣으세요. 각 단계 끝의 체크리스트로 완료를 확인한 후 다음 단계로 넘어갑니다.

## 단계 1: Next.js 프로젝트 초기화

예상 시간: 10분

프롬프트

대전 재기지원사업 운영관리 플랫폼 Next.js 14 프로젝트를 초기화해줘.요구사항:1. create-next-app으로 App Router + TypeScript 프로젝트 생성2. tsconfig.json strict, noUncheckedIndexedAccess, noImplicitAny 활성화3. ESLint + Prettier 기본 설정4. .env.example 파일 생성 (Supabase URL/KEY, 알림톡 API 키 자리 포함)commit: "chore: initialize Next.js project"

완료 확인 체크리스트

☐  프로젝트 정상 실행 (npm run dev)

☐  tsconfig strict 옵션 확인

☐  .env.example 존재

## 단계 2: shadcn/ui 설치

예상 시간: 20분

프롬프트

shadcn/ui를 설치하고 이 프로젝트에서 필요한 기본 컴포넌트를 추가해줘.요구사항:1. shadcn/ui init (Tailwind 연동)2. 다음 컴포넌트 추가: button, input, table, dialog, badge, tabs, card, form, select, textarea, toast, dropdown-menu, avatar3. lucide-react 아이콘 설치commit: "feat: setup shadcn/ui components"

완료 확인 체크리스트

☐  components/ui/ 폴더에 컴포넌트 생성 확인

☐  샘플 페이지에서 Button 렌더링 확인

## 단계 3: Supabase 셋업

예상 시간: 30분

💡 사전 작업: Supabase 프로젝트를 콘솔에서 서울 리전으로 미리 생성

프롬프트

Supabase 프로젝트(서울 리전 ap-northeast-2)를 연동해줘.요구사항:1. @supabase/ssr 기반 클라이언트/서버/미들웨어 헬퍼 작성 (lib/supabase/client.ts, server.ts, middleware.ts)2. 세션 미들웨어로 인증 상태 자동 갱신3. Storage 버킷 3개 생성: documents(서류), signatures(서명), photos(멘토링 사진) — 모두 비공개(private), signed URL로만 접근주의사항:- 서울 리전(ap-northeast-2) 반드시 확인- service_role 키는 서버 전용, 클라이언트 번들에 노출 금지commit: "feat: setup Supabase client/server helpers"

완료 확인 체크리스트

☐  Supabase 연결 확인

☐  리전 서울(ap-northeast-2) 확인

☐  Storage 버킷 3개 생성 확인

## 단계 4: 폴더 구조 셋업

예상 시간: 10분

프롬프트

설계 문서 5장 라우팅 구조를 참고해 역할별 폴더 구조 셸을 만들어줘.요구사항:1. src/app/(auth)/login2. src/app/(institution)/institution/dashboard, cases/[id]3. src/app/(nextlab)/nextlab/dashboard, cases/[id]4. src/app/(mentor)/mentor/dashboard, cases/[id]/log, cases/[id]/apply5. src/app/(mentee)/mentee/dashboard, cases/[id]/upload6. src/app/(admin)/admin/audit-logs, admin/settings/support-types7. src/lib, src/components/{ui,common,cases}, src/hooks, src/types 폴더 생성각 폴더에 최소 placeholder page.tsx 생성.commit: "chore: scaffold role-based route groups"

완료 확인 체크리스트

☐  각 라우트 그룹 폴더·page.tsx 존재

☐  빌드 에러 없음

## 단계 5: 디자인 토큰 정의

예상 시간: 30분

프롬프트

설계 문서 8.6절 톤(신뢰감 있는 공공기관 협업툴 스타일, 차분한 블루/그레이 톤)에 맞춰 디자인 토큰을 정의해줘.요구사항:1. tailwind.config.ts theme.extend에 컬러 토큰 정의 (primary: 네이비 계열, 상태색: 대기=회색/진행=블루/승인=그린/반려=레드)2. Pretendard 폰트 적용3. 단계 배지(badge) 컴포넌트 — 12단계 상태값별 색상 매핑commit: "feat: define design tokens"

완료 확인 체크리스트

☐  tailwind.config.ts에 토큰 반영

☐  상태 배지 컴포넌트 12개 상태 정상 렌더링

## 단계 6: DB 스키마 마이그레이션

예상 시간: 2~3시간

프롬프트

설계 문서 10장 데이터 모델을 참고해 Supabase 마이그레이션 SQL을 작성해줘.요구사항:1. 다음 17개 테이블 생성: users, support_types, support_type_documents, document_templates, cases, case_status_history, mentor_assignments, mentoring_logs, signatures, contractors, documents, support_applications, reviews, approvals, payment_applications, notifications, audit_logs2. cases.status는 설계문서 10.2절 enum 그대로 (12단계)3. support_types에는 서류·금액 규칙만 시딩: 경영개선(한도 300만원, 정액), 폐업정리(한도 500만원, 전용면적 1평당 20만원 cap). 자격심사·정원(TO) 관련 필드는 두지 않음 (진흥원이 별도 처리)4. cases 테이블은 접수신청서(붙임1) 기준 필드로 구성: business_name, owner_name, business_reg_no, phone, address, email, business_type, item, opened_at, employee_count (+폐업정리 전용: closure_status, closed_at, revenue_last_year, lease_deposit, monthly_rent)5. 모든 테이블 RLS 활성화. 역할별 정책:   - 멘토는 mentor_assignments로 연결된 케이스만 조회   - 멘티는 본인 케이스만 조회   - 진흥원/넥스트랩은 전체 조회6. audit_logs, case_status_history는 INSERT만 허용 (UPDATE/DELETE 정책 없음)7. created_at, updated_at 모든 테이블에 포함, id는 UUID v4주의사항:- 외래키 ON DELETE 정책 명시 (케이스 삭제 시 연관 데이터 처리 방식 결정)- raw SQL은 마이그레이션 파일에서만, 앱 코드에서는 Supabase 클라이언트만 사용commit: "feat: add database schema with RLS policies"

완료 확인 체크리스트

☐  17개 테이블 마이그레이션 적용 확인

☐  support_types 초기값(한도·계산방식) 시딩 확인

☐  RLS 정책 각 role로 테스트

☐  audit_logs INSERT-only 확인

## 단계 7: 인증 흐름 구현

예상 시간: 2~3시간

프롬프트

관리자 발급 계정 기반 인증 흐름을 구현해줘.요구사항:1. 이메일+비밀번호 로그인 (셀프 가입 없음)2. 관리자(진흥원/넥스트랩)가 계정 발급 시 임시 비밀번호 생성 → 최초 로그인 시 비밀번호 변경 강제3. 멘티는 케이스 등록 후 넥스트랩이 초대 링크 발급 → 최초 로그인 시 본인확인 후 활성화4. 역할(role)에 따라 로그인 후 리다이렉트 분기 (institution/nextlab/mentor/mentee)5. 개인정보 수집·이용 동의 체크박스 (멘티 최초 로그인 시)commit: "feat: implement role-based auth flow"

완료 확인 체크리스트

☐  4개 역할 로그인 후 올바른 대시보드로 분기

☐  최초 로그인 비밀번호 변경 강제 동작

☐  멘티 동의 체크 누락시 진입 차단

## 단계 8: 라우팅 골격 + 역할별 대시보드

예상 시간: 2시간

프롬프트

역할별 대시보드 셸에 실제 데이터 연동 골격을 붙여줘.요구사항:1. 각 대시보드에서 Server Component로 본인 권한 범위의 케이스 목록 조회2. 진흥원/넥스트랩: 전체 케이스 테이블 (필터: 유형/단계/멘토/기간)3. 멘토: 담당 케이스 카드 목록4. 멘티: 본인 케이스 진행 단계 타임라인 UI (12단계 중 현재 위치 시각화)commit: "feat: implement role dashboards with live data"

완료 확인 체크리스트

☐  역할별 대시보드에서 RLS로 필터링된 데이터만 노출 확인

☐  멘티 타임라인 UI 정상 렌더링

## 단계 9: 케이스 등록 · 멘토 배정

예상 시간: 3시간

프롬프트

워크플로우 1~2단계(대상자 등록, 멘토 배정)를 구현해줘.요구사항:1. 진흥원: 케이스 신규 등록 폼 — 대전비즈에서 이미 선정된 신청자의 접수신청서(붙임1) 기준 정보를 입력: 업체명, 대표자명, 사업자등록번호, 연락처, 사업장주소, 이메일, 업태, 종목, 개업연월일, 상시근로자수. 지원유형(경영개선/폐업정리) 선택 시 폐업정리는 폐업/폐업예정 구분, 폐업(예정)연월일, 매출액, 임대차보증금, 월세금액 추가 입력2. 자격심사·선정 관련 로직(새출발기금 확인, 매출액 기준 검증, 지원제외 업종 체크 등)은 절대 구현하지 않음 — 진흥원이 대전비즈 및 별도 절차로 이미 처리 완료한 건만 이 화면에 입력됨을 전제로 한다3. 넥스트랩: 등록된 케이스에 멘토 배정 UI (멘토 목록에서 선택)4. 배정 완료 시 case_status_history에 자동 기록, notifications 큐에 등록 예약 (13단계에서 실제 발송 연동)5. 상태 전이 가드: registered 상태에서만 배정 가능하도록 서버에서 검증commit: "feat: implement case registration and mentor assignment"

완료 확인 체크리스트

☐  케이스 등록 폼이 접수신청서 필드와 일치하는지 확인

☐  케이스 등록 → registered 상태 생성 확인

☐  멘토 배정 → mentor_assigned 전이 확인

☐  잘못된 상태에서 배정 시도 시 차단 확인

## 단계 10: 멘토링 일지 + 서명 캡처 + 사진 업로드

예상 시간: 4시간

프롬프트

워크플로우 3~4단계(멘티 확인/연락, 멘토링 일지)를 구현해줘.요구사항:1. react-signature-canvas로 서명 캡처 컴포넌트 (모바일 터치 지원)2. 멘토링 일지 작성 폼: 방문일시, 내용, 사진 업로드(다중), 멘토·멘티 서명 2종3. 사진·서명은 Supabase Storage 업로드 후 documents/signatures 테이블에 기록 (SHA-256 해시 저장)4. 작성 완료 시 log_completed 상태로 전이주의사항:- 모바일 터치 서명 캡처 정상 동작 필수 (현장 방문 사용)- 파일 업로드는 signed URL 발급 방식commit: "feat: implement mentoring log with signature capture"

완료 확인 체크리스트

☐  모바일에서 서명 캡처 정상 동작

☐  사진 다중 업로드 확인

☐  log_completed 상태 전이 확인

## 단계 11: 공사업체 등록 · 서류 업로드 (유형별 분기)

예상 시간: 4시간

프롬프트

워크플로우 5단계(공사/설비업체 등록)를 구현해줘. 경영개선/폐업지원 유형별로 필수서류가 다르다.요구사항:1. support_type_documents 테이블 기반으로 유형에 따라 필수서류 목록을 동적으로 렌더링 (하드코딩 금지). 경영개선은 사업추진계획서(사진), 폐업정리는 가족관계증명서·임대차계약서가 추가로 필요함2. 멘티가 업체정보 입력 + 서류 업로드 (업체는 계정 없음, 멘티가 직접 처리)3. 업체 서명(계약서 등)도 캔버스 서명으로 대체 캡처4. 폐업정리는 전용면적 입력 필드를 추가하고 (평당 20만원 × 면적) vs 500만원 중 낮은 금액을 자동 계산해 지원한도로 표시5. 견적서는 100만원 이상일 경우 2개 이상 첨부하도록 UI에서 안내하고 개수 검증6. 필수서류 전부 제출 시에만 contractor_registered 상태로 전이 (미제출 항목 있으면 진행 차단 + 안내)7. 관리자 화면(/admin/settings/support-types)에서 진흥원/넥스트랩이 유형별 필수서류·지원한도를 직접 수정 가능하게주의사항: 자격심사·지원제외 여부 판정 로직은 구현하지 않는다 (진흥원 별도 처리 영역).commit: "feat: implement contractor registration with type-based document rules"

완료 확인 체크리스트

☐  경영개선/폐업정리 필수서류 목록이 다르게 렌더링됨

☐  폐업정리 면적당 한도 자동계산 확인

☐  견적서 100만원 이상시 2개 이상 검증 확인

☐  필수서류 미제출시 다음 단계 차단

☐  관리자가 필수서류 항목 수정 가능

## 단계 12: 지원신청서 작성·검수·승인 워크플로우 + 붙임서식 자동생성

예상 시간: 6시간

프롬프트

워크플로우 6~9단계(지원신청서 작성 → 검수 → 승인/반려 → 통보 대기)와 붙임서식 자동생성 파이프라인을 구현해줘.요구사항:1. 멘토: 지원신청서 작성 폼 (앞선 단계 데이터 자동 연동) — 일반 shadcn/ui 폼이면 충분, 원본 서식 레이아웃을 화면에 재현할 필요 없음2. document_templates 테이블에 저장된 붙임서식별 HTML 템플릿(hwp5html로 사전 변환한 원본 레이아웃 기반)에 케이스 데이터를 주입해 최종 문서를 생성하는 서버 함수 구현 (경영개선 붙임5, 폐업정리 붙임1 등 유형별 신청서 템플릿)3. Puppeteer/Playwright로 완성된 HTML을 PDF로 렌더링, Supabase Storage에 저장 후 documents 테이블에 기록4. 넥스트랩: 검수 화면 — 생성된 PDF 미리보기 + 승인 또는 "보완요청"(반려 아님, 멘토에게 재작성 요청)5. 진흥원: 최종 승인/반려 화면, 반려 시 사유 필수 입력6. 반려 시 케이스는 rejected 상태 + 보완 후 재검수 가능하도록 reviewed로 재진입 허용7. 각 전이는 case_status_history 자동 기록주의사항:- 진흥원 승인/반려는 approvals 테이블에 INSERT, UPDATE 금지 (이력 보존)- 서버에서 역할별 액션 권한 재검증 (멘토가 승인 API 호출 불가하도록)- 생성된 PDF가 원본 hwp 서식과 표 구조·문구가 동일한지 육안 대조 필수commit: "feat: implement application review/approval workflow with template-based document generation"

완료 확인 체크리스트

☐  작성→검수→승인 전체 플로우 정상 동작

☐  생성된 PDF가 원본 붙임서식과 레이아웃 일치 확인

☐  반려 후 재보완 플로우 확인

☐  역할별 권한 밖 액션 서버에서 차단 확인

## 단계 13: 알림톡 + SMS 자동 통보 연동

예상 시간: 3시간

💡 사전 작업: 알림톡 발신프로필 등록 및 대행사(비즈엠/솔라피 등) 계약 완료 필요

프롬프트

카카오 알림톡 API(비즈엠/솔라피 등 택1)와 SMS 대체발송을 연동해줘.요구사항:1. 승인/반려/배정완료/지급승인 등 6장 표에 정의된 발생 시점마다 알림 발송 트리거2. 알림톡 발송 실패 시 자동으로 SMS 대체발송 (fallback)3. notifications 테이블에 발송 채널·결과·시각 기록4. 진흥원 승인 대기 3일 초과 시 담당자에게 독촉 알림 (cron 또는 Supabase scheduled function)주의사항:- API 키는 서버 환경변수로만 관리- 발송 실패도 반드시 로그로 남겨 통보 누락 분쟁 대비commit: "feat: integrate Kakao AlimTalk with SMS fallback"

완료 확인 체크리스트

☐  승인 시 3자(넥스트랩/멘토/멘티) 모두 알림 수신 확인

☐  알림톡 실패 시뮬레이션 → SMS 대체발송 확인

☐  notifications 로그 기록 확인

## 단계 14: 지급신청서·백오피스 통계·감사로그

예상 시간: 6시간

프롬프트

워크플로우 10~12단계(시공/지급증빙 등록 → 지급신청서 → 지급승인)와 백오피스 통계·감사로그를 구현해줘.요구사항:1. 멘티: 이체확인서·하자보수서약서 등 사후서류 업로드2. 넥스트랩: 지급신청서 작성 화면 (제출서류 자동 첨부). document_templates 기반으로 완료보고서 및 지원금 신청서(경영개선 붙임7 / 폐업정리 붙임4) PDF를 12단계와 동일한 파이프라인으로 자동 생성3. 지급계좌 입력 시 반드시 대표자(또는 법인) 본인 명의인지 확인하는 검증 문구와 체크 표시, 완료보고서 제출기한(선정통보 후 3개월 이내) 안내 표시4. 진흥원: 지급신청서 승인 → 케이스 종료(payment_approved) 처리5. 백오피스 통계 위젯: 단계별 케이스 분포, 유형별 건수, 평균 처리일수, 승인대기 건수 (recharts)6. audit_logs: 모든 관리자 액션(승인/반려/배정/설정변경) 자동 기록, /admin/audit-logs에서 조회 (INSERT-only 재확인)commit: "feat: implement payment application with document generation, stats dashboard, and audit log"

완료 확인 체크리스트

☐  지급신청→승인까지 전체 플로우 정상 동작

☐  완료보고서·지급신청서 PDF가 원본 서식과 레이아웃 일치 확인

☐  지급계좌 본인명의 검증 문구 노출 확인

☐  케이스 종료 상태 정상 반영

☐  통계 위젯 데이터 정확성 확인

☐  감사로그 UPDATE/DELETE 시도 시 DB에서 차단 확인

## 단계 15: 최종 점검 + 배포

예상 시간: 2시간

프롬프트

전체 시스템 최종 점검 후 Vercel에 배포해줘.요구사항:1. 4개 역할 계정으로 전체 12단계 워크플로우 E2E 수동 테스트2. 모바일(멘토/멘티 화면) 반응형 최종 확인3. noindex 메타태그 전체 페이지 적용 (내부 도구, 검색노출 차단)4. 환경변수 Vercel 프로젝트에 등록, .env.example과 동기화 확인5. Supabase RLS 정책 전체 재점검 (역할별 크로스 접근 시도 테스트)commit: "chore: final review and deploy"

완료 확인 체크리스트

☐  전체 워크플로우 12단계 E2E 통과

☐  모바일 반응형 확인

☐  noindex 적용 확인

☐  RLS 크로스 접근 차단 확인

☐  Vercel 배포 완료
