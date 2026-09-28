# 모두의창업 플랫폼 — 멘티·멘토 정보 보안 정책 및 적용 계획

> 작성일 2026-09-28 · 기준 코드 `claude/modu-platform-audit-tutute`(= main 2026-09-25 머지본, 마지막 커밋 `d58e4ed` P34-0) · 마이그레이션 0001~0084 적용본 + 작업 트리의 미커밋 P34-A/B(스모크 CI·오류 보고, 0085)는 "미커밋"으로 표기
> 이 문서는 **정책(지킬 것)** 과 **현황 진단(지금 어디까지 되어 있는가)** 과 **적용 계획(무엇을 언제 고칠 것인가)** 을 한 곳에 둔다.
> 진단표의 "없음/부분" 판정은 실제 코드·마이그레이션을 읽고 내린 것이며, 근거 파일을 함께 적었다.
> 기관명은 쓰지 않는다 — `{발주처}` `{운영사}` 는 행사 기본 설정(`programs.client_name / operator_name`)에 등록된 이름을 뜻한다.

---

## 0. 문서 목적 · 적용 범위 · 용어

### 0-1. 목적
- 멘티(약 400명)·멘토(약 80명)·담당자의 개인정보와 업무정보(아이디어·보고서·평가·정산액)를 **누가, 어디까지, 어떤 기록을 남기며** 다룰 수 있는지 정한다.
- 현재 플랫폼이 이미 갖춘 통제와 아직 없는 통제를 구분하고, 없는 것을 우선순위에 따라 도입하는 계획을 확정한다.
- {발주처}·{운영사} 담당자가 개인정보 보호 관점에서 플랫폼을 설명·점검할 수 있는 기준 문서가 된다.

### 0-2. 적용 범위
- 시스템: Next.js 14 App Router(Vercel icn1) + Supabase(Postgres·Auth·Storage, ap-northeast-2) + 문자(Solapi)·이메일(SMTP)·AI 매칭(Anthropic API, 선택).
- 데이터: `programs` 계층 아래의 모든 행사 데이터. 한 배포에 여러 행사가 공존하므로 **행사 간 격리**도 이 정책의 대상이다.
- 사람: 플랫폼 관리자, {발주처} 담당자(institution), {운영사} 담당자(nextlab, 등급 PL/PM/부PM/옵저버), 멘토, 멘티, 멘티 팀원(계정 없음).

### 0-3. 용어
| 용어 | 뜻 | 플랫폼에서의 대응 |
|---|---|---|
| 정보주체 | 개인정보의 당사자 — 멘티·멘티 팀원·멘토·담당자 | `users`, `case_team_members` |
| 위탁자(개인정보처리자) | 사업을 발주하고 개인정보 처리 목적을 정하는 주체 = {발주처} | 역할 `institution`, `programs.client_name` |
| 수탁자(처리자) | 위탁받아 실제 운영·처리하는 주체 = {운영사} | 역할 `nextlab`, `programs.operator_name` |
| 플랫폼 관리자 | 행사 개설·계정 통합 관리 전용 계정(행사 소속 불가) | `users.is_platform_admin`, `/platform/*` |
| 대행(view-as) | 담당자가 멘토·멘티 계정 화면을 대신 여는 기능 | `src/lib/auth/impersonation.ts` |
| 반출 | 플랫폼 밖으로 데이터를 내보내는 행위(엑셀·ZIP·PDF·문자·화면 캡처 포함) | `src/app/api/**/*-export`, `*-zip`, 문자 발송 |
| 1급/2급/3급/4급 | 이 문서의 정보자산 등급(§1) | — |

---

## 1. 정보자산 분류표

등급 정의
- **1급 민감**: 유출 시 신원 도용·금전 피해로 직결. 신분증·통장사본·서명 이미지·고유식별정보.
- **2급 개인식별**: 개인을 특정하거나 연락할 수 있는 정보. 이름·휴대폰·이메일·소속·직위·권역·로그인 아이디.
- **3급 업무**: 개인정보는 아니지만 사업상 비밀 또는 평판·금전에 영향. 아이디어·보고서·관찰의견서·평가·정산액·원천징수.
- **4급 공개**: 행사명·그룹명·안내 문구 등.

| 등급 | 항목 | 저장 위치 (테이블 · 컬럼 / 버킷 · 경로) | 접근 가능 역할 | 반출 경로 | 코드 근거 |
|---|---|---|---|---|---|
| 1급 | 멘토 신분증사본·통장사본·이력서 파일 | `mentor_payment_docs.id_card_path / bankbook_path / resume_path` → 버킷 `documents` | 멘토 본인(RLS `select_self`), 행사 스태프(RLS `is_program_staff`) · **업로드는 플래그 `mentor_doc_upload` 기본 OFF** | 멘토 명단 다운로드 링크(서명 URL 10분), ZIP `/api/staff/mentor-docs-zip`(운영사 `mentors.docs` / 발주처 `institution_docs_zip` 옵션) | `supabase/migrations/0069_payment_doc_uploads.sql`, `src/lib/mentors/payment-doc-actions.ts`, `src/lib/data/mentors.ts:84`, `src/app/api/staff/mentor-docs-zip/route.ts` |
| 1급 | 멘티 회차 확인 서명 이미지 | `signatures.storage_path`(+`sha256`, `log_id`) → 버킷 `signatures` | 케이스 관련자(`can_access_case`) | 회차 보고서 PDF에 인라인, 케이스 ZIP | `0002_core_schema.sql`(signatures), `0057_mentee_features.sql`, `src/lib/storage/files.ts`(`downloadDataUrl`) |
| 1급 | 멘토 서명 이미지 | `mentor_signatures.storage_path` → 버킷 `signatures` | 본인 + 같은 행사 구성원(`shares_program_with`) | 보고서 PDF | `0058_report_templates_and_signatures.sql:26-37` |
| 1급 | 주민등록번호 | **현재 미보관.** P13의 `mentor_form_submissions.rrn_sealed`(봉투암호화)는 0083에서 테이블째 삭제됨 | — | — | `0064_mentor_forms.sql:27`(도입) → `0083_mentor_doc_checklists.sql:58-59`(drop) |
| 1급 | 문자 API 자격증명(행사별) | `program_sms_settings.*_enc`(AES-256-GCM 봉투암호화, KEK=`SMS_KEK`) | **RLS 정책 없음 = 클라이언트 전면 차단**, 서버 service_role만 | 없음(힌트 앞4/뒤4만 화면) | `0056_docs_visibility_observation_sms.sql:46-69`, `src/lib/sms/secrets.ts` |
| 2급 | 이름·휴대폰·이메일·소속·직위 | `users.name / phone / email / organization / position` | 본인, 스태프(`is_staff` = 어느 행사에서든 스태프) | 명단 엑셀 `/api/nextlab/roster-export`, 매칭 리스트 엑셀, 리포트 엑셀, 문자 수신자 목록 | `0002_core_schema.sql`(users), `0060`(position), `0062`(organization), `0059_program_member_roles.sql`(has_role) |
| 2급 | 멘티 로그인 아이디(이름+휴대폰 뒷4자리) | 파생값(저장 안 함) | — | 로그인 안내 문자 | `src/lib/auth/identifier.ts`(`menteeLoginKey`) |
| 2급 | 멘티 케이스 기본정보(대표자명·닉네임·연락처·이메일·주소·권역·고유번호·유형·희망분야·희망 멘토·순위·비고) | `cases.owner_name / business_name / phone / email / address`, `mentee_profiles.*`(nickname, external_no, region, needs, preferred_mentor, rank, note) | 스태프, 담당 멘토(`is_mentor_of`), 멘티 본인 | 명단·매칭·리포트 엑셀, 케이스 ZIP 파일명(대표자명 포함) | `0002`, `0054_matching_and_mentor_docs.sql:40`, `0072_roster_columns_redefine.sql`, `0075` |
| 2급 | 멘티 팀원 명단(이름·역할·휴대폰·이메일) | `case_team_members` | 케이스 관련자(`can_access_case`) | 회차 참가자 스냅샷(`mentoring_logs.participants`)→보고서 PDF | `0063_team_members_two_stage_rounds.sql:8-25` |
| 2급 | 멘토 프로필(분야·권역·소속기관·경력·비고) | `mentor_profiles.*` | 본인, 행사 스태프 | 멘토 명단·매칭 엑셀, 멘토 팝업(`MentorName`) | `0054:19`, `0072:7-8`, `src/lib/mentors/popup-actions.ts` |
| 2급 | 임의 컬럼 값(카테고리 마크 — 자유 텍스트라 개인정보가 들어갈 수 있음) | `roster_columns`, `roster_values` | 행사 스태프(RLS), 쓰기 service_role | 명단 엑셀 | `0062_roster_columns_and_org.sql:7-33` |
| 2급 | 조사 대상자 스냅샷(이름·휴대폰·토큰) | `survey_campaign_targets.name / phone / token` | 행사 스태프(RLS), **토큰 페이지는 비로그인** | 문자 링크 `/s/{token}`, 조사 엑셀 `/api/nextlab/survey-export` | `0061_survey_campaigns.sql:24-43`, `src/app/s/[token]/page.tsx` |
| 2급 | 알림·문자 수신 이력(수신 번호·본문) | `notifications.recipient_phone / payload`, `scheduled_messages.text`, `program_sms_access_log` | 행사 스태프 | 문자 이력 화면 | `0002`(notifications), `0037_sms_scheduling_and_settings.sql:20`, `0053:45-53` |
| 2급 | 감사 로그의 메타데이터(계정 발급·삭제 시 이메일·이름 기록) | `audit_logs.metadata` | 행사 스태프(행사 범위 RLS) | 감사 엑셀 `/api/nextlab/audit-export` | `src/lib/auth/member-actions.ts:386`, `src/lib/audit/describe.ts:61-64` |
| 2급 | 비밀번호 재설정 OTP | `password_reset_otps.code_hash`(SHA-256 해시만) | **RLS 정책 없음 = service_role 전용** | 문자(코드 원문, 5분) | `0031_password_reset_otp.sql`, `src/lib/auth/password-reset-actions.ts` |
| 3급 | 창업 아이템·아이디어 설명 | `cases.item`, `mentee_profiles.item_description / summary` | 스태프, 담당 멘토, 멘티 본인 | 엑셀(아이디어 컬럼), AI 매칭 시 Anthropic API 전송(선택) | `0063:32`, `src/lib/matching/recommend.ts` |
| 3급 | 회차 보고서(웹 본문·업로드 PDF·현장 사진) | `mentoring_logs.content`, `documents`(`mentoring_report:{logId}`, `mentoring_photo:{logId}`) → 버킷 `documents` / `photos` | 케이스 관련자 · 멘티 관련 서류는 `mentor_visible` 로 멘토 노출 제어 | 케이스 ZIP `/api/staff/case-docs-zip`, 회차 엑셀 | `0056:10-24`, `src/lib/workflow/case-documents.ts` |
| 3급 | 관찰의견서(=평가서), 운영사 멘토 평가, 만족도 응답 | `observation_reports`, `mentor_group_reviews`, `survey_responses.answers` | 관찰의견서: 케이스 관련자 / 평가·만족도: 스태프 | 리포트·매칭 엑셀(평점), 종합결과리포트 | `0056:27-42`, `0051_requests_surveys_reviews.sql:55` |
| 3급 | 정산 스냅샷·원천징수·실지급액, 품의 | `settlements`, `settlement_batches`, `documents`(`settlement_statement:{id}`) | 스태프, 해당 멘토 본인 | 정산·원천세 엑셀, 품의 PDF/엑셀, 멘토 정산서 PDF | `0050_settlements.sql`, `src/app/api/nextlab/{settlements,tax}-export`, `src/app/api/nextlab/batches/[id]/*` |
| 3급 | 멘토↔멘티 메시지, 문의, 게시판 | `direct_messages.body`, `inquiries`, `board_posts` | 당사자 + 행사 스태프(모니터링) | 없음 | `0068_direct_messages.sql`, `0080:53-70` |
| 3급 | 종합결과리포트 스냅샷 | `report_snapshots.content`(생성 시점 데이터 고정) | 행사 스태프(발주처판은 평가 제외) | html·pdf·docx·xlsx·pptx `/api/reports/summary/[id]/export`(감사 있음) | `0060:26-40`, `src/app/api/reports/summary/[id]/export/route.ts:31` |
| 2급 | 화면 오류 보고(경로·User-Agent·오류 메시지·보고자 id, IP 는 해시) — 미커밋 P34-B | `error_reports`(서비스롤 전용, 정책 없음) | 플랫폼 관리자 콘솔 | 오류 알림 문자(플랫폼 관리자 휴대폰, 건수·digest 만) | `supabase/migrations/0085_error_reports.sql`, `src/lib/ops/error-reports.ts`, `/api/cron/error-alert` |
| 4급 | 행사명·그룹명·브랜딩·안내 문구·FAQ | `programs`, `support_types`, `faqs` | 로그인 사용자 전체 | — | `0046`, `0047` |

> 접근 범위의 원칙: RLS 헬퍼 `is_staff/is_nextlab/is_institution` 은 **"어느 행사에서든 그 역할"**(`0059` `has_role`)이므로, 행사 간 격리는 RLS 만으로 완성되지 않는다. 서비스롤 경로의 `ctx.programId` 코드 필터(`src/lib/programs/context.ts`)가 두 번째 겹이다(§2 원칙 4).

---

## 2. 보안 원칙 10개

| # | 원칙 | 무엇을 뜻하는가 | 플랫폼 구현 지점 |
|---|---|---|---|
| 1 | **최소 권한** | 역할·등급·권한 키 단위로 "필요한 것만". 옵저버는 열람+리포트, PM 은 금액·삭제·대행 제한 | `src/lib/auth/capabilities.ts`(`DEFAULT_GRANTS`, `denyUnless`), `programs.staff_permissions` override |
| 2 | **행사 격리** | 한 배포 안의 여러 행사는 서로의 데이터를 볼 수 없다 | RLS `private.program_role(pid)`·`is_program_staff(pid)` + 모든 스태프 조회에 `ctx.programId` |
| 3 | **신원 분리(§6-1)** | 특권 판정·감사 실행자는 실제 신원(`getRealSessionProfile`), 업무 명의는 유효 신원(`getSessionProfile`). 대행 중 둘이 다르다 | `src/lib/auth/guards.ts`, `src/lib/workflow/audit.ts`(`on_behalf_of`) |
| 4 | **서비스롤 경로는 코드가 범위를 강제(§6-2)** | service_role 은 RLS 를 우회하므로 배정·소속·행사 확인은 코드에서 직접 | `mentorOfCaseOrNull`, `assertMemberOfProgram`, `createCaseScopedSignedUrl` |
| 5 | **감사 불변** | 감사 로그는 INSERT-only, actor 위조 불가, insert 오류를 삼키지 않는다 | `0003`(UPDATE/DELETE 정책 없음), `0030_audit_actor_guard.sql`, `logAudit` |
| 6 | **마스킹 기본** | 화면·엑셀은 업무에 필요한 최소 표시가 기본, 원문은 권한자가 의도적으로 연다 | **미구현** → §4 R-4 |
| 7 | **반출 최소·기록** | 내보내기는 권한자만, 사유와 함께 감사에 남기고, 파일은 보관기간 후 파기 | ZIP·종합리포트만 감사 → §4 R-3 |
| 8 | **암호화** | 전송은 TLS, 저장은 플랫폼 디스크 암호화 + 비밀·고유식별정보는 앱 계층 봉투암호화 | `src/lib/sms/secrets.ts`(SMS 자격증명), 주민번호 미보관 |
| 9 | **보존기한** | 목적이 끝난 개인정보는 정한 기간 뒤 파기하고 파기 사실을 기록한다 | **미구현** → §4 R-8 |
| 10 | **사고 대응** | 탐지 → 차단 → 영향 파악 → 통지(법정 기한) → 재발 방지의 순서와 담당을 미리 정한다 | **미구현** → §4 R-14, §5-6 |

---

## 3. 현황 진단표

상태: **적용** = 코드로 강제됨 / **부분** = 일부 경로만 또는 사람 절차에 의존 / **없음** = 구현·문서 모두 없음.
위험도: **상** = 개인정보 유출·계정 탈취로 직결 / **중** = 내부자 오남용·추적 불가 / **하** = 개선 권고.

### 3-1. 인증·계정

| # | 통제 항목 | 상태 | 근거 파일 | 위험 | 개선 필요 내용 |
|---|---|---|---|---|---|
| A1 | 셀프 가입 없음 — 운영진 발급·명단 우선 등록 | 적용 | `src/lib/auth/admin-accounts.ts`, `src/lib/auth/member-actions.ts`, `src/lib/import/bulk-import.ts` | — | — |
| A2 | 임시 비밀번호 강도 | **부분** | 개별 발급은 14자 난수(`admin-accounts.ts:10 generateTempPassword`) / **엑셀 일괄 등록·로그인 안내 문자는 "임시 비밀번호 = 본인 휴대폰 번호(숫자)"**(`bulk-import.ts:237`, `member-actions.ts:835`) / 로그인이 하이픈 제거 숫자로 재시도(`actions.ts:38-45`) | **상** | 멘티 아이디(이름+뒷4자리)와 휴대폰 번호를 아는 제3자가 첫 로그인 전 계정을 선점할 수 있다. 일괄 등록도 난수 임시 비밀번호 + 문자로 1회 전달, 또는 최초 로그인 시 OTP 본인확인으로 전환 |
| A3 | 최초 로그인 비밀번호 변경 강제 | 적용 | `users.must_change_password`, `guards.ts requireUser`(실행자 기준) | — | — |
| A4 | 비밀번호 규칙 | **부분** | `src/lib/validations/auth.ts changePasswordSchema` = 8자 이상만. 복잡도·이전 비밀번호 재사용 금지·변경 주기 없음 | 중 | 10자 이상 + 문자/숫자 혼합, 직전 N개 재사용 금지(해시 이력), 담당자 계정은 180일 주기 권고 |
| A5 | 로그인 실패 잠금·속도 제한 | **없음** | `src/lib/auth/actions.ts signIn` 에 실패 카운트 없음. Supabase Auth 기본 rate limit 에만 의존(설정값은 저장소 밖) | **상** | 계정별 실패 N회(예 10회) → 15분 잠금 + 감사 `account.login_locked`, IP 기준 속도 제한. `src/lib/sms/reauth.ts` 의 카운터 방식을 재사용 |
| A6 | 관리자에 의한 계정 잠금·행사 범위 비활성 | 적용 | `lockMemberAccountAction`(`users.is_active`), 행사 범위 `program_members.is_active`(P31) | — | — |
| A7 | 비밀번호 분실 재설정(OTP) | 적용 | `0031_password_reset_otp.sql`(해시 저장, RLS 정책 없음=서버 전용), `password-reset-actions.ts`(5분·시도 5회·시간당 5회·60초 쿨다운·계정 존재 여부 익명화) | — | — |
| A8 | 민감 작업 비밀번호 재인증 | 부분 | `src/lib/sms/reauth.ts`(5회 실패 → 15분 잠금) — 문자 API 설정·지급서류 개별 상태 변경에 적용. P27 이후 지급서류 셋트 변경은 확인 팝업만 | 하 | 1급 파일 다운로드·엑셀 반출에도 재인증(또는 2FA) 적용 검토 |
| A9 | 2단계 인증(2FA) | **없음** | 코드·설정 없음. OTP 발송 인프라(`password-reset-actions.ts`, `sendSms`)는 재사용 가능 | **상** | 운영사·발주처·플랫폼 관리자 로그인 시 문자 OTP 필수(§4 R-6) |
| A10 | 세션 만료·유휴 로그아웃·동시 세션 | **없음** | `src/lib/supabase/middleware.ts updateSession` 은 토큰 자동 갱신만. 유휴 타임아웃·절대 만료·동시 세션 제한 없음(Supabase 기본: 액세스 1시간, 리프레시 무기한 갱신) | 중 | 스태프: 유휴 30분·절대 12시간, 멘토·멘티: 유휴 24시간. Supabase 대시보드 세션 설정(single session / time-box) + 앱 최근 활동 기록 |
| A11 | 운영사 총괄 셀프 등록 확인코드 | 부분 | `src/lib/auth/register-operator.ts`, `0067`(1회 소진 원자적 UPDATE). **코드가 `public/guide.html` 에 실림**(P16 결정) | 중 | 안내서에서 코드 제거, 코드 24시간 만료·문자 전달 |
| A12 | 멘티 로그인 식별자 추측 가능성 | 부분 | `identifier.ts menteeLoginKey` = 이름+뒷4자리(공개 정보에 가깝다) | 중(A2 와 결합 시 상) | A2 해결 시 위험 완화. 장기적으로 이메일/휴대폰 로그인만 유지 검토 |
| A13 | 부트스트랩 토큰 | 적용 | `src/app/api/setup/route.ts`(`safeEqual`, 관리자 존재 시 409). 삭제는 운영 조치(CLAUDE.md §9 "삭제할 것") | 하 | Vercel 에서 `BOOTSTRAP_TOKEN` 제거 여부를 §6 점검표로 확인 |

### 3-2. 접근 통제

| # | 통제 항목 | 상태 | 근거 파일 | 위험 | 개선 필요 내용 |
|---|---|---|---|---|---|
| B1 | 전 테이블 RLS 활성 | 적용 | `0003_rls.sql`, `0046`, `0054`, `0056`, `0059`, `0080`… 신규 테이블마다 `enable row level security` | — | 새 테이블 추가 시 §6 점검표로 확인 |
| B2 | RLS 헬퍼 비노출(private 스키마) | 적용 | `0005_harden_helpers.sql`(PostgREST RPC 노출 제거, search_path 고정) | — | — |
| B3 | 행사 간 격리 | 적용 | RLS `program_role(pid)`·`is_program_staff(pid)`(`0059`), 게시판·문의·요청·예약문자 행사 범위(`0080`), 서비스롤 경로 `ctx.programId`(`src/lib/programs/context.ts`) | — | `is_staff()` 가 "어느 행사에서든 스태프"라 `users` 전체 select 가 가능(`0046:124 users_select`). 명단 UI 는 코드 필터하나 RLS 단독으로는 타 행사 회원 조회가 열려 있음 → R-2 |
| B4 | 운영사 등급·권한 키 | 적용 | `src/lib/auth/capabilities.ts`(PL/PM/부PM/옵저버, `members.sensitive`·`members.view_as`·`case.delete` 분리, 개인 override) + 모든 서버 액션 `denyUnless` | — | — |
| B5 | 대행(view-as) 통제 | 적용 | `src/lib/auth/impersonation.ts`(HMAC 서명 쿠키 v2, 실행자 uid 대조, 행사 대조, 대상 역할 허용표, fail-closed), 시작/종료 감사 `impersonation.start/stop`, 대행 중 서명·동의·문의 차단 | — | 대행 사유 입력 없음 → R-3 에 포함 |
| B6 | 신원 분리·서버 액션 역할 재검증 | 적용 | `guards.ts`(`realRoleOrNull`, `mentorOfCaseOrNull`) | — | — |
| B7 | 스토리지 버킷 비공개 | 적용 | `0001_storage_buckets.sql`(3버킷 `public=false`) | — | — |
| B8 | `storage.objects` RLS 정책 | **없음** | `0001` 주석에 "별도 정의"라 적혀 있으나 어느 마이그레이션에도 `storage.objects` 정책 없음. 접근은 전부 service_role 서명 URL(브라우저 직접 조회 불가) | 하 | 현 구조(서명 URL 전용)에서는 실질 위험 낮음. anon 키로 버킷 목록·객체 접근이 불가함을 §6 점검표로 확인 |
| B9 | 서명 URL 만료·경로 검증 | 적용/부분 | `src/lib/storage/files.ts createSignedUrl`(기본 300초, 사용처 600초), `createCaseScopedSignedUrl`(케이스 폴더 접두 검증). **멘토 지급서류는 경로 검증 없이 서명**(`src/lib/data/mentors.ts:84`, 스태프 전용 페이지) | 하 | 지급서류 경로도 `mentor-payment-docs/{programId}/` 접두 검증 |
| B10 | 업로드 파일 검증 | 부분 | `src/lib/storage/upload-validation.ts`(매직바이트·10MB·PDF/이미지), 보고서 사진 10장·20MB 서버 검증(P31). `photo-upload-url/route.ts` 는 확장자만 보고 스테이징 경로에 서명 업로드 URL 발급 | 하 | 스테이징 → 케이스 폴더 이관 시 매직바이트 재검증 여부 확인, 스테이징 잔여 파일 청소 cron |
| B11 | 1급 파일(신분증·통장) 접근 | 부분 | 업로드 자체가 플래그 `mentor_doc_upload` 기본 OFF(`src/lib/platform/features.ts`). 켜면 스태프 전원이 링크로 열람 가능, 다운로드 감사 없음, 워터마크 없음 | **상**(플래그 ON 시) | R-5: 다운로드 감사 + `mentors.docs` 권한 + 재인증 + 워터마크(열람자·일시) + 만료 60초 |
| B12 | 발주처 일괄 반출 옵션 | 적용 | `institution_docs_zip`·`institution_sms`(`programs.staff_permissions`, `mentor-docs-zip/route.ts:32-38`) | — | — |
| B13 | 멘티 서류 멘토 공개/비공개 | 적용 | `documents.mentor_visible` + RLS(`0056:16-21`) + 코드 필터 | — | — |

### 3-3. 감사·추적

| # | 통제 항목 | 상태 | 근거 파일 | 위험 | 개선 필요 내용 |
|---|---|---|---|---|---|
| C1 | 감사 로그 INSERT-only·actor 위조 방지 | 적용 | `0003`(UPDATE/DELETE 정책 없음), `0030_audit_actor_guard.sql`, service_role 경로는 `logAudit` | — | — |
| C2 | 감사 insert 실패 미삼킴 | 적용 | `src/lib/workflow/audit.ts`(`console.error('[audit] insert failed')`) | — | 실패 시 알림(Vercel 로그 알럿) 연결 권고 |
| C3 | 변경(write) 감사 범위 | 적용 | 계정·소속·배정·회차·검수·정산·품의·문자·설정·대행·삭제 전반(`src/lib/audit/describe.ts` 규칙 100여 건) | — | — |
| C4 | **열람(read) 감사** | **없음** | 명단·케이스 상세·멘토 팝업·지급서류 링크 열람에 기록 없음 | **상** | R-3: 1급 파일 열람과 2급 원문(마스킹 해제) 열람을 `audit_logs`(action `view.*`)에 기록 |
| C5 | 반출 감사 | **부분** | 있음: `case.docs_zip_export`(`case-docs-zip/route.ts:67`), `mentor.docs_zip_export`(`mentor-docs-zip/route.ts:82`), `report.export`(종합리포트). **없음**: 엑셀 라우트 9종(`roster-export`, `reports/export`, `settlements-export`, `rounds-export`, `tax-export`, `audit-export`, `survey-export`, `mentor-docs-export`, `batches/[id]/export`), 품의 PDF, 회원별 지급서류 다운로드 링크 | **상** | R-3: 공용 `logExport()` 를 모든 export 라우트에 + 반출 사유 입력(UI) + 행 수·컬럼 기록 |
| C6 | 감사에 IP·User-Agent | **없음** | `audit_logs.ip_address` 컬럼은 있으나 기록하는 코드 0건(`grep ip_address src` → 타입 파일만) | 중 | `logAudit` 에서 `headers()` 의 `x-forwarded-for`·`user-agent` 를 채움 |
| C7 | 로그인 성공·실패 감사 | **없음** | `signIn` 에 감사 없음(Supabase Auth 로그는 대시보드에만) | 중 | `account.login` / `account.login_failed`(식별자 마스킹) 기록 |
| C8 | 감사 로그 보존·파기 | 없음 | 무기한 보관(정책 없음) | 하 | 보존 3년 후 익명화(actor·metadata 개인정보 제거) 규정 |
| C9 | 문자 API 자격증명 접근 이력 | 적용 | `program_sms_access_log`(set/rotate/disable/test/send_use/decrypt_fail/reauth_fail) | — | — |
| C10 | 감사 로그 사람 언어 설명·소스 팝업·엑셀 | 적용 | `src/lib/audit/describe.ts`, `AuditTable`, `/api/nextlab/audit-export` | — | 감사 엑셀 자체가 반출이므로 C5 에 포함 |

### 3-4. 암호화·비밀·전송

| # | 통제 항목 | 상태 | 근거 파일 | 위험 | 개선 필요 내용 |
|---|---|---|---|---|---|
| D1 | 전송 구간 TLS | 적용 | Vercel·Supabase 기본 HTTPS | — | HSTS 헤더는 D4 |
| D2 | 저장 암호화 — 플랫폼 | 적용(외부) | Supabase 디스크 암호화(플랫폼 제공) | — | — |
| D3 | 저장 암호화 — 앱 계층 | 부분 | 문자 API 자격증명만 봉투암호화(`src/lib/sms/secrets.ts` L1~L7). 개인정보 컬럼(휴대폰·이메일·주소)은 평문. 주민등록번호는 미보관(0083 drop) | 중 | 1급을 새로 보관하게 되면(주민번호·계좌번호) 반드시 `secrets.ts` 의 seal/open 을 일반화한 `sealed-field` 로 저장. 2급 컬럼 암호화는 검색·로그인(휴대폰 조회) 영향이 커서 비권장 — 마스킹+감사로 대체 |
| D4 | 보안 헤더(CSP·HSTS·X-Frame-Options/frame-ancestors·Referrer-Policy·Permissions-Policy) | **없음** | `next.config.mjs` 에 `headers()` 없음, `src/middleware.ts` 도 세션 갱신만 | 중 | R-7: `headers()` 추가. CSP 는 인라인 스크립트·PDF 서명 URL 도메인(Supabase)·Google Fonts 를 허용 목록화 후 report-only → enforce |
| D5 | 쿠키 속성 | 적용 | 컨텍스트·대행 쿠키 `httpOnly`·`sameSite=lax`·`secure(prod)`·HMAC 서명(`src/lib/programs/context.ts:48-52`, `impersonation-actions.ts:111-115`), Supabase 세션 쿠키는 `@supabase/ssr` 기본 | — | 컨텍스트 쿠키 TTL 30일(`context-cookie.ts CONTEXT_TTL_SEC`)은 세션보다 길다 — 세션 만료(A10)와 함께 정리 |
| D6 | 서명 키 파생 | 부분 | `VIEW_AS_SECRET` 미설정 시 `SUPABASE_SERVICE_ROLE_KEY` 에서 HMAC 파생(`impersonation.ts:70-78`, `context-cookie.ts:21-27`) | 하 | `VIEW_AS_SECRET` 을 별도 설정해 서비스롤 키 로테이션과 쿠키 무효화를 분리 |
| D7 | 비밀키 목록·문서 | 적용 | `.env.example`, `docs/DEPLOY-RUNBOOK.md`(생성 방법·삭제 시점), 플랫폼 콘솔 시스템 상태(`src/lib/platform/data.ts:313-317` 존재 여부만 표시) | — | — |
| D8 | 비밀키 로테이션 주기 | **없음** | 정해진 주기·절차 없음. `SMS_KEK` 교체 시 자격증명 전부 재등록 필요(`.env.example` 주석) | 중 | R-12: 주기표(§5-7)와 KEK 재래핑 스크립트 |
| D9 | Cron 인증 | 적용 | 4개 cron 라우트 `Authorization: Bearer CRON_SECRET` + `safeEqual`(`src/app/api/cron/*/route.ts`, `src/lib/auth/secret.ts`) | — | — |
| D10 | 의존성 취약점 관리 | 부분 | xlsx 0.20.3 재배포 패키지로 CVE 해소(P32-2). 검증 4종·`npm audit` 을 돌리는 CI 없음(스모크 워크플로만, G6), Dependabot 없음 | 중 | R-11: GitHub Actions 에 검증 4종 + `npm audit --audit-level=high` + Dependabot |
| D11 | 로그에 개인정보 출력 | 적용(확인) | `console.*` 82곳 중 이메일·휴대폰 직접 출력 0건(grep). 감사 metadata 에는 계정 발급·삭제 시 이메일 기록(`member-actions.ts:386`) | 하 | 감사 metadata 이메일은 목적상 유지하되 감사 엑셀 반출 시 마스킹 옵션(R-4) |
| D12 | AI 매칭 외부 전송 | 부분 | `src/lib/matching/recommend.ts` 가 멘티·멘토 키워드 프로필을 Anthropic API 로 전송(선택 기능, `ANTHROPIC_API_KEY` 없으면 미전송) | 하 | 전송 항목을 이름·연락처 제외로 고정하고, 동의문·처리방침에 "AI 추천을 위한 외부 처리" 명시(R-13) |

### 3-5. 통신(문자·이메일·공개 링크)

| # | 통제 항목 | 상태 | 근거 파일 | 위험 | 개선 필요 내용 |
|---|---|---|---|---|---|
| E1 | 알림 템플릿의 개인정보 최소화 | 적용 | `src/lib/notifications/templates.ts` 23종 — 이름·연락처 없음, `{program}/{operator}/{client}` 만. 실지급액은 `payload.message` | — | — |
| E2 | 로그인 안내 문자 내용 | **부분** | `member-actions.ts:835` "임시 비밀번호: 본인 휴대폰 번호(숫자만)" — 문자 하나로 아이디·비밀번호 규칙이 모두 드러남 | 상(A2 와 동일 원인) | A2 해결과 함께 문구 교체 |
| E3 | 문자 수신자 행사 소속 한정·배치·테스트 제한 | 적용 | P30/P31(수신자 `program_members` 대조, 테스트 발송 본인/소속 회원만) | — | — |
| E4 | 공개 조사 토큰 링크 | 적용 | `src/lib/surveys/campaigns.ts:24`(16바이트 난수 base64url), 캠페인 기간·상태 게이트, 응답 후 재사용 불가, 잘못된 토큰은 무정보(`/s/[token]/page.tsx`) | 하 | 페이지에 대상자 이름 표시(`targetName`) — 링크 전달 오류 시 이름 노출. 이름 대신 "회원님" 표기 검토 |
| E5 | 이메일(SMTP) | 적용 | `src/lib/notifications/email.ts`(SMTP TLS `SMTP_SECURE`), 템플릿 E1 과 동일 | — | — |
| E6 | 알림 이벤트별 on/off | 적용 | `programs.notification_settings`(0084), `notificationEnabled()` | — | — |

### 3-6. 삭제·보존·정보주체 권리

| # | 통제 항목 | 상태 | 근거 파일 | 위험 | 개선 필요 내용 |
|---|---|---|---|---|---|
| F1 | 케이스 완전 삭제(스토리지 포함) | 적용 | `src/lib/workflow/case-delete.ts`(FK CASCADE + documents/photos/signatures 정리, 품의 편성 건 차단, 감사 `case.delete`) | — | — |
| F2 | 회원 삭제·비활성·잠금 분리 | 적용 | `deleteMemberAction`(auth 삭제·지급서류·서명 파일 정리), `program_members.is_active`(행사 범위), `users.is_active`(잠금) | — | — |
| F3 | **보존기간 규정·자동 파기** | **없음** | 자동 파기 cron 없음. 처리방침은 "사업 종료 후 5년"(`src/app/(auth)/privacy-policy/page.tsx:40`), 멘티 동의문은 "기본 3년"(`src/components/mentee/consent-form.tsx:38`) — **서로 불일치** | **상** | R-8: 보존기간 확정(사용자 결정) → 방침·동의문 통일 → 행사 종료일 기준 파기 스케줄 + 파기 대장 |
| F4 | 개인정보처리방침 정합 | **부분** | `privacy-policy/page.tsx` 가 원본(재기지원) 잔재를 담고 있음: "사업자등록번호·계좌정보·견적서·보조금 관리 규정", 시행일 2026-07-07, 보유 5년 | **상** | R-13: 실제 수집 항목(§1)·위탁 구조·AI 외부 처리·보존기간으로 재작성, 행사별 책임자 연락처를 `programs` 에서 읽음 |
| F5 | 멘티 개인정보 동의 | 적용 | `consent-form.tsx`(수집 항목·목적·기간·제3자·거부권), `users.privacy_agreed_at`, 대행 중 제출 차단 | — | 동의 문안 버전 기록 없음(재동의 판단 불가) → R-13 에 `consent_version` |
| F6 | 멘토·담당자 동의 | **없음** | 멘토 최초 로그인 동의 게이트 없음(`requireMentor` 는 역할만). 멘토는 오프라인 서류 수령 체크(`mentor_doc_receipts`)로 대체 | 중 | 멘토 최초 로그인 시 개인정보·정산 정보 처리 동의 화면(또는 오프라인 동의서 수령 체크 항목에 "개인정보 동의서" 필수 포함) |
| F7 | 정보주체 열람·정정 경로 | 부분 | 멘토 `/mentor/profile`(프로필·지급서류·서명 자기 관리). **멘티 자기 정보 수정 화면 없음**(`src/app/(mentee)/mentee/` 에 profile 없음, 정정은 운영사 케이스 상세) | 중 | R-9: 멘티 `/mentee/profile`(연락처·이메일 정정, 팀원 정보), 모든 역할 "내 정보 열람·정정·삭제 요청" 메뉴 |
| F8 | 삭제·처리정지 요청 처리 절차 | 없음 | 문의(`inquiries`)로 대신할 수는 있으나 절차·기한·기록 없음 | 중 | R-9: 요청함에 "개인정보 요청" 유형, 처리 기한(10일)·결과 감사 |
| F9 | 종료 회원의 파일(서명·지급서류) 파기 | 부분 | 삭제 시에만 정리(F2). 행사 종료 후 잔존 | 중 | F3 와 함께 |

### 3-7. 운영·인프라

| # | 통제 항목 | 상태 | 근거 파일 | 위험 | 개선 필요 내용 |
|---|---|---|---|---|---|
| G1 | 백업·복구(PITR) | **미확인** | 저장소·런북에 백업 정책 없음. Supabase 플랜에 따라 일일 백업/PITR 이 다름 | 중 | R-10: 플랜 확인 → PITR 활성 여부 기록, 분기 복구 리허설 |
| G2 | Supabase 보안 어드바이저 | 적용 | P8 기준 INFO 2건(서비스롤 전용 테이블, 의도) | — | 분기 점검(§6) |
| G3 | 화면·엑셀 마스킹 | **없음** | 명단·매칭·팝업·엑셀 모두 휴대폰·이메일 원문(`roster-export/route.ts`, `MentorName` 팝업 등) | **상** | R-4 |
| G4 | 담당자 계정 회수(퇴사·이동) 절차 | 없음 | 기능(잠금·소속 해제)은 있으나 절차·점검 주기 없음 | 중 | §5-1 규정 + 월간 점검 |
| G5 | 침해사고 대응 절차 | **없음** | 문서 없음 | 상 | R-14, §5-6 |
| G6 | 검증 자동화(CI) | **부분** | 작업 트리에 미커밋 P34-A `.github/workflows/smoke.yml`(배포 URL 스모크 점검, `deployment_status` 트리거)만 존재. 검증 4종·`npm audit` 을 돌리는 워크플로는 없음 | 중 | R-11 |
| G7 | 플랫폼 관리자 계정 격리 | 적용 | `is_platform_admin` 소속 차단 트리거(0060), 대행 대상에서 제외, owner 만 부관리자 지정 | — | 2FA(A9) 최우선 대상 |
| G8 | 테스트 데이터·임시 파일 청소 | 부분 | P24 청소 실행, 케이스 삭제 기능. 스토리지 `_staging/` 잔여 파일 청소 없음 | 하 | B10 과 함께 cron |
| G9 | 운영 DB 상주 점검 계정(스모크 시드, 미커밋 P34-A) | **부분** | `src/lib/ops/smoke-seed.ts`·`/api/ops/smoke-seed`: `SMOKE_SEED_TOKEN` 으로만 실행, 비밀번호는 `SMOKE_PASSWORD` 환경변수(응답 미포함). 행사 `smoke` 에 발주처·운영사(PL)·멘토·멘티 계정 4개가 **Production 에 상주**. RLS `is_staff()` 가 "어느 행사에서든 스태프"라 이 계정으로 로그인하면 `users` 전체 select 가능(B3) | 중 | 점검 계정은 `is_active` 를 점검 직후 false 로 되돌리거나(시드가 활성화 → 점검 → 비활성화), 2FA 예외·비밀번호 분기 로테이션, `SMOKE_PASSWORD` 를 GitHub·Vercel 두 곳에 두므로 §5-7 로테이션 표에 포함. R-16(users RLS 행사 범위화)이 근본 대책 |
| G10 | 화면 오류 자동 보고 저장(미커밋 P34-B) | 적용 | `0085_error_reports.sql`: 서비스롤 전용(정책 없음), IP 는 해시(`ip_hash`)만, `user_agent`·`path`·`message`·`user_id` 저장. `/api/client-error` 는 비로그인도 보고 가능 | 하 | `message` 에 개인정보가 섞이지 않도록 브라우저 보고 시 길이 제한·URL 쿼리 제거 확인, 보존 90일 후 삭제 cron(R-8b 와 함께) |

### 3-8. 진단 요약 — "없음/부분" 중 위험 상위 10개

| 순위 | 항목(#) | 상태 | 한 줄 요약 | 근거 파일 | 대응 |
|---|---|---|---|---|---|
| 1 | A2·E2 임시 비밀번호 = 휴대폰 번호 | 부분 | 일괄 등록 계정은 이름+뒷4자리 아이디와 휴대폰 번호만 알면 첫 로그인 전 선점 가능 | `src/lib/import/bulk-import.ts:237`, `src/lib/auth/member-actions.ts:835`, `src/lib/auth/actions.ts:38-45` | R-1 |
| 2 | A5·C7 로그인 실패 잠금·감사 | 없음 | 무제한 시도 가능(Supabase 기본 제한만), 실패 기록 없음 | `src/lib/auth/actions.ts signIn` | R-2 |
| 3 | C5 엑셀 반출 감사 | 부분 | ZIP·종합리포트만 기록, 엑셀 라우트 9종·품의 PDF·지급서류 링크는 무기록 | `src/app/api/nextlab/*-export/route.ts`, `src/app/api/reports/export/route.ts`, `src/lib/data/mentors.ts:84` | R-3a |
| 4 | C4 열람 감사 | 없음 | 명단·팝업·1급 파일 열람 기록 없음 | 전 화면 | R-3b |
| 5 | G3 마스킹 | 없음 | 휴대폰·이메일 원문이 명단·엑셀·팝업 기본 표시 | `src/app/api/nextlab/roster-export/route.ts`, `src/lib/utils/labels.ts`, `MentorName` | R-4 |
| 6 | A9 2단계 인증 | 없음 | 담당자 계정이 비밀번호 하나로 400명 개인정보 전체에 접근 | `src/lib/auth/actions.ts` | R-6 |
| 7 | F3·F4 보존기간·처리방침 | 없음/부분 | 자동 파기 없음, 방침 5년 vs 동의문 3년 불일치, 방침에 원본 잔재 항목 | `src/app/(auth)/privacy-policy/page.tsx:40`, `src/components/mentee/consent-form.tsx:38` | R-13a, R-8b |
| 8 | B11 1급 파일 접근 통제 | 부분 | 플래그 ON 시 스태프 전원 링크 열람, 다운로드 감사·워터마크 없음 | `src/lib/data/mentors.ts:84`, `src/lib/mentors/payment-doc-actions.ts` | R-5 |
| 9 | A10 세션 만료·유휴 로그아웃 | 없음 | 리프레시 무기한, 유휴·동시 세션 제한 없음, 컨텍스트 쿠키 30일 | `src/lib/supabase/middleware.ts`, `src/lib/programs/context-cookie.ts:11` | R-8a |
| 10 | D4 보안 헤더 | 없음 | CSP·HSTS·frame-ancestors 미설정 | `next.config.mjs` | R-7a/b |

그 외 중 위험: C6 감사 IP 미기록 · D8 키 로테이션 주기 없음 · D10/G6 CI 없음 · F6 멘토 동의 없음 · F7/F8 정보주체 권리 화면·절차 없음 · G1 백업 미확인 · G4/G5 회수·사고 절차 없음 · A11 확인코드가 안내서에 게시 · B3 `users` RLS 가 행사 범위가 아님 · G9 운영 DB 점검 계정 상주.

---

## 4. 적용 계획(로드맵)

우선순위 기준: 위험 "상" → 사용자 결정 불필요한 것부터. 공수는 1인 기준 일수(설계+구현+검증 4종).

### 4-1. 즉시 (1주 이내)

| ID | 항목 | 구현 지점 | 공수 | 스키마 | 사용자 결정 |
|---|---|---|---|---|---|
| **R-1** | **임시 비밀번호 = 휴대폰 번호 폐지**(A2·E2). 일괄 등록도 `generateTempPassword()` 난수 사용, 로그인 안내 문자에 임시 비밀번호를 1회 포함(문자는 본인 휴대폰으로만 감). `signIn` 의 숫자 재시도 제거 | `src/lib/import/bulk-import.ts`, `src/lib/auth/member-actions.ts`(`sendLoginGuideAction`, 계정 발급), `src/lib/auth/actions.ts:38-45`, 안내서 `public/guide.html` | 2일 | 없음 | **결정 ①** 기존에 휴대폰 번호로 발급된 계정(아직 `must_change_password=true`)을 일괄 재발급할지 |
| **R-2** | 로그인 실패 잠금·감사(A5·C7): 계정별 10회 실패 → 15분 잠금, `account.login_failed/login_locked/login` 감사(식별자 마스킹), IP 기록 | `src/lib/auth/actions.ts`, 카운터는 `src/lib/sms/reauth.ts` 방식(`app_settings` 키) 또는 신규 `login_attempts` 테이블 | 1.5일 | 선택(신규 테이블 권장) | — |
| **R-3a** | 반출 감사 공용화(C5): `logExport(ctx, {kind, rows, columns, filter})` 를 만들고 엑셀 라우트 9종·품의 PDF·지급서류 다운로드 링크 발급에 적용 | 신규 `src/lib/audit/export.ts`, `src/app/api/nextlab/*-export/route.ts`, `src/app/api/reports/export/route.ts`, `src/app/api/nextlab/batches/[id]/*`, `src/lib/data/mentors.ts:84` | 1.5일 | 없음(`audit_logs` 재사용, action `export.*`) | — |
| R-7a | 보안 헤더 1차(D4): HSTS(preload 제외)·X-Content-Type-Options·Referrer-Policy·Permissions-Policy·`frame-ancestors 'none'`(X-Frame-Options DENY). CSP 는 report-only 로 시작 | `next.config.mjs headers()` | 0.5일 | 없음 | — |
| R-13a | 처리방침·동의문 보존기간 불일치 임시 통일(F3·F4): 확정 전까지 두 문서 모두 "사업 종료 후 3년(관련 법령이 더 길게 정한 경우 그에 따름)"으로 맞춤, 원본 잔재 항목(사업자등록번호·계좌·견적서·보조금) 삭제 | `src/app/(auth)/privacy-policy/page.tsx`, `src/components/mentee/consent-form.tsx` | 0.5일 | 없음 | **결정 ②** 보존기간(3년/5년/행사별 설정) — 정산 증빙 보존 의무와 맞춰야 함 |
| R-0 | 운영 확인(코드 변경 없음): Vercel 에서 `BOOTSTRAP_TOKEN` 삭제 확인, `VIEW_AS_SECRET` 별도 설정, `SMS_KEK`·`CRON_SECRET` 백업 위치 기록, Supabase Auth 의 rate limit·세션 설정 현재값 캡처 | Vercel·Supabase 대시보드, `docs/DEPLOY-RUNBOOK.md` 에 결과 기록 | 0.5일 | 없음 | — |

### 4-2. 1개월 이내

| ID | 항목 | 구현 지점 | 공수 | 스키마 | 사용자 결정 |
|---|---|---|---|---|---|
| **R-4** | **마스킹 기본**(G3·C4): 명단·매칭 리스트·케이스 표·멘토 팝업·엑셀에서 휴대폰 `010-****-1234`, 이메일 `ab***@domain` 기본. [원문 보기] 토글은 `members.sensitive` 권한자만, 토글 시 `view.contact_unmask` 감사(대상 id 목록). 엑셀은 `?unmask=1` + 반출 사유 입력 + 감사. 멘토가 보는 담당 멘티 연락처는 업무상 원문 유지(감사 없음) | 신규 `src/lib/utils/mask.ts`, `src/lib/utils/labels.ts`, `src/components/common/contact-links.tsx`, `src/components/nextlab/{roster,matching-lists}.tsx`, `MentorName`, export 라우트 | 4일 | 없음 | **결정 ③** 발주처 화면의 기본 마스킹 여부(권고: 마스킹, 옵션 `institution_unmask`) |
| **R-3b** | 열람 감사 + 반출 사유(C4·C5·B5): 1급 파일(지급서류·서명 원본) 열람 링크 발급 시 `view.payment_doc` 감사, ZIP·엑셀 반출 전 사유 선택(정산 증빙 제출/발주처 보고/내부 검토/기타 입력) 다이얼로그, 대행 시작 시 사유 선택 | `src/components/common/export-reason-dialog.tsx`(신규), `ExcelButton`, `impersonation-actions.ts` | 2일 | 없음 | — |
| **R-5** | 1급 파일 접근 통제(B11·B9): `mentor_doc_upload` ON 행사에서 지급서류 링크는 `mentors.docs` + 비밀번호 재인증(1시간 기억) 후 60초 만료 URL, 이미지·PDF 에 열람자 이름·일시 워터마크(서버에서 `pdf-lib`/`sharp` 합성 후 스트림), 경로 접두 검증 | `src/lib/data/mentors.ts`, 신규 `src/app/api/staff/payment-doc/[userId]/[kind]/route.ts`, `src/lib/storage/watermark.ts` | 3일 | 없음 | **결정 ④** 워터마크 적용 범위(지급서류만 / 회차 사진·서류 ZIP 포함) |
| **R-6** | 2단계 인증(A9): 플랫폼 관리자·발주처·운영사 로그인 시 문자 OTP 필수(코드 6자리·5분·시도 5회, 0031 테이블 구조 재사용), 기기 기억 30일(서명 쿠키), 멘토·멘티는 선택 | `src/lib/auth/actions.ts`(로그인 2단계 상태), 신규 `login_otps`(또는 `password_reset_otps` 에 `purpose` 컬럼), `src/app/(auth)/login/`, `guards.ts`(`mfa_verified_at` 세션 확인) | 4일 | 있음(`users.mfa_required`, OTP `purpose`) | **결정 ⑤** 운영사·발주처 전원 필수로 할지(권고: 필수), 문자 비용 부담 주체 |
| R-8a | 세션 정책(A10·D5): Supabase 세션 time-box(스태프 12시간)·유휴 30분(앱에서 `last_seen_at` 갱신 + 미들웨어 판정), 컨텍스트 쿠키 TTL 을 세션과 동일하게, 동시 세션 1개(Supabase single-session 옵션) | `src/lib/supabase/middleware.ts`, `context-cookie.ts`, Supabase Auth 설정 | 2일 | `users.last_seen_at` | **결정 ⑥** 유휴 시간(30분/60분), 동시 세션 허용 여부 |
| R-7b | 보안 헤더 2차: CSP enforce(`script-src 'self' 'nonce-…'`, `img-src` 에 Supabase 스토리지 도메인, `connect-src` Supabase, `frame-src 'none'`), 위반 리포트 수집 | `next.config.mjs`, `src/middleware.ts`(nonce) | 2일 | 없음 | — |
| R-11 | CI·의존성(D10·G6): GitHub Actions 에 검증 4종 + `npm audit --audit-level=high` + Dependabot 주간, 실패 시 main 머지 차단 | `.github/workflows/verify.yml`, `.github/dependabot.yml` | 1일 | 없음 | — |
| R-12a | 비밀키 로테이션 도구(D8): `SMS_KEK` 재래핑 스크립트(구 KEK 로 DEK 풀고 새 KEK 로 재봉인, 지문 재계산), `CRON_SECRET`·서비스롤 키 교체 절차를 런북에 | `scripts/rotate-sms-kek.mjs`, `docs/DEPLOY-RUNBOOK.md` | 1일 | 없음 | — |
| R-9a | 멘티 내 정보 화면(F7): `/mentee/profile` — 연락처·이메일 정정(이메일은 auth 동기화), 팀원 정보, 동의 이력 열람, "삭제·처리정지 요청" 버튼(요청함으로) | `src/app/(mentee)/mentee/profile/page.tsx`, `src/lib/workflow/mentee-actions.ts` | 2일 | 없음 | — |

### 4-3. 분기 이내

| ID | 항목 | 구현 지점 | 공수 | 스키마 | 사용자 결정 |
|---|---|---|---|---|---|
| **R-8b** | **보존·파기 스케줄**(F3·F9·C8): 행사 `ends_on` + 보존기간 경과 시 ① 파기 예정 목록을 운영사·발주처에 30일 전 알림 ② PL 승인 후 개인정보 익명화(이름 → "파기됨-{id 앞8}", 휴대폰·이메일·주소 null, 파일 삭제, 서명·사진 삭제) ③ 정산·통계는 익명 상태로 보존 ④ `disposal_records`(파기 대장: 대상 수·항목·일시·승인자·방법) | 신규 cron `/api/cron/retention`, `src/lib/retention/{plan,execute}.ts`, 설정 탭 [보존·파기](`programs.retention_months`) | 5일 | 있음(`programs.retention_months`, `disposal_records`, `users.anonymized_at`) | **결정 ②(재확인)** 보존기간, **결정 ⑦** 승인자(PL/발주처) 및 정산 증빙 파일(정산서 PDF·서명 포함 보고서) 예외 보존 여부 |
| R-9b | 정보주체 권리 절차(F8): 요청함 유형 "개인정보 열람/정정/삭제/처리정지", 접수→10일 내 처리 기한 표시, 처리 결과 감사 `privacy.request_*`, 본인 확인(OTP) 후 열람 내역 PDF 제공 | `src/lib/data/requests.ts`, `/nextlab/requests`, `operator_requests.kind` | 3일 | `operator_requests.kind` 값 추가 | — |
| R-10 | 백업·복구(G1): Supabase 플랜 PITR 확인·활성, 분기 1회 복구 리허설(브랜치 DB 로 복원 → 검증 4종), 스토리지 별도 백업(rclone 스냅샷) 여부 결정 | 런북 §백업, `scripts/backup-storage.sh` | 2일 | 없음 | **결정 ⑧** Supabase 플랜(PITR 은 Pro 이상 애드온) 비용 승인 |
| R-13b | 처리방침·동의 체계 완성(F4·F5·F6·D12): 행사별 방침(책임자·연락처를 `programs` 에서), 동의 문안 버전 `consent_version` 기록·변경 시 재동의, 멘토 최초 로그인 동의 게이트, AI 외부 처리 고지, 수탁자 목록(문자·이메일·AI·호스팅) | `privacy-policy/page.tsx`, `consent-form.tsx`, `users.consent_version`, 멘토 `requireMentor` 게이트 | 3일 | `users.consent_version`, `programs.privacy_officer` | **결정 ⑨** 멘토 동의를 플랫폼에서 받을지(오프라인 수령 체크로 갈음할지) |
| R-14 | 침해사고 대응(G5·C2): §5-6 절차 확정, 대응 담당 연락망, 사고 시 즉시 조치 스크립트(전 세션 무효화 = Supabase 전체 로그아웃, 특정 계정 잠금, 서명 URL 무효화 = 키 교체), 감사 insert 실패 알럿 | `docs/INCIDENT-RUNBOOK.md`, `scripts/emergency-{logout-all,lock-user}.mjs` | 2일 | 없음 | **결정 ⑩** 사고 통지 책임 주체({발주처} 개인정보 보호책임자)와 연락망 |
| R-12b | 로테이션 정례화: 분기마다 `CRON_SECRET`·`VIEW_AS_SECRET`, 반기마다 서비스롤 키·`SMS_KEK`, 담당자 비밀번호 180일 | 런북·§6 점검표 | 0.5일/회 | 없음 | — |
| R-15 | 2급 컬럼 부분 암호화 검토(D3): 휴대폰·이메일을 검색 가능한 결정적 암호화(HMAC 인덱스 + 봉투암호화 본문)로 전환할지 비용·이점 평가. 로그인(휴대폰 조회)·문자 발송·엑셀 왕복 전부 영향 | 평가 문서만 | 2일 | — | 평가 후 결정 |
| R-16 | `users` RLS 행사 범위화(B3): `users_select` 를 "본인 ∨ 같은 행사 구성원 ∨ 플랫폼 관리자"로 좁힘(`shares_program_with` 재사용). 스태프 전 화면이 service_role 경로라 영향 적으나 anon 클라이언트 조회 전수 확인 필요 | 신규 마이그레이션, `grep "from('users')"` 의 anon 경로 점검 | 1.5일 | RLS 정책 교체 | — |

### 4-4. 로드맵 요약(의존 관계)
```
즉시   R-1 임시비번 ─┐            R-3a 반출감사 ─┐        R-7a 헤더1차   R-13a 문안통일   R-0 운영확인
       R-2 실패잠금 ─┴─ (계정 탈취 차단)          │
1개월  R-6 2FA ← R-2               R-4 마스킹 ←──┴─ R-3b 열람감사·사유 ← R-5 1급 파일 통제
       R-8a 세션    R-7b CSP    R-11 CI    R-12a KEK 도구    R-9a 멘티 내정보
분기   R-8b 보존·파기 ← 결정②    R-9b 권리절차 ← R-9a    R-10 백업    R-13b 동의체계 ← R-13a    R-14 사고대응    R-16 users RLS
```
합계 공수 약 45일(1인 기준). 즉시 단계 6.5일, 1개월 단계 21일, 분기 단계 17.5일.

---

## 5. 운영 규정(사람이 지킬 것)

### 5-1. 계정 발급·회수
1. 계정은 **명단 우선 등록 → 로그인 안내 문자** 순서로만 발급한다. 임시 비밀번호를 카카오톡·이메일·구두로 전달하지 않는다(R-1 이후 문자 자동 전달만).
2. 담당자 계정의 기본 등급은 **옵저버**. 등급 상향은 PL 이 하고 사유를 `program_members.note` 에 남긴다.
3. 담당자가 이동·퇴사하면 **당일** 행사 소속 해제(`program_members.is_active=false`) 후, 다른 행사 소속이 없으면 계정 잠금(`lockMemberAccountAction`). 매월 §6 점검에서 잔존 계정을 확인한다.
4. 발주처 계정은 열람 전용이 기본이며, `institution_docs_zip`·`institution_sms`·(R-4 후) `institution_unmask` 옵션은 PL 이 발주처 요청서를 받은 뒤에만 켠다.
5. 플랫폼 관리자 계정은 통합 관리자 2명 이내로 유지하고, 행사 운영에 쓰지 않는다.

### 5-2. 대행(view-as) 사용 조건
1. 대행은 **멘토·멘티가 직접 할 수 없는 상황**(입력 대기·기기 문제·현장 지원)에서만 쓴다. "편해서"는 사유가 아니다.
2. `members.view_as` 권한은 PM 이상, 부PM 은 행사별 override 로만.
3. 대행 중 금지: 멘티 서명 대신 하기, 동의 대신 하기, 문의 대신 쓰기(시스템이 차단하지만 우회 시도도 금지). 현장 서명은 멘티 본인이 단말에 직접 그린다.
4. 대행 시작·종료는 자동 감사되며(R-3b 이후 사유 포함), 월간 점검에서 대행 건수 상위 담당자를 확인한다.
5. 대행을 켠 채 자리를 비우지 않는다. 종료 버튼으로 끝낸다(로그아웃도 종료로 기록됨).

### 5-3. 엑셀·ZIP·PDF 반출 취급
1. 반출은 **업무 목적이 있을 때만**, 반출 사유를 선택하고(R-3b), 필요한 탭·범위만 내려받는다. 행사 전체 명단보다 그룹 범위를 우선한다.
2. 내려받은 파일은 **암호(문서 암호)를 걸어** 보관하고, 사내 공유 드라이브의 접근 제한 폴더 외에는 두지 않는다. 개인 메신저·개인 메일·USB 로 옮기지 않는다.
3. 발주처 보고용 파일은 마스킹본(R-4)을 기본으로 하고, 원문본은 발주처가 문서로 요청한 경우에만 사용한다.
4. 반출 파일 보관기간은 **목적 달성 후 30일**, 정산 증빙 제출본은 정산 완료 후 보관 규정에 따른다. 기간이 지나면 삭제하고 §6 월간 점검에 "반출 파일 파기 확인"을 체크한다.
5. 화면 캡처·사진 촬영도 반출이다. 명단·연락처 화면은 캡처하지 않는다.

### 5-4. 문자·이메일 발송 시 개인정보 최소화
1. 문자 본문에 다른 사람의 이름·연락처를 넣지 않는다. `{name}` 치환은 수신자 본인 이름만.
2. 임시 비밀번호·인증번호가 든 문자는 재발송 전 수신 번호를 다시 확인한다(오발송 = 사고).
3. 번호 붙여넣기 발송은 회원 대조에서 미소속으로 걸러진 번호에 보내지 않는다(시스템이 막지만, 수동으로 다시 넣지 않는다).
4. 행사별 문자 API 키는 PL 만 등록·교체하며, 키를 메신저·메일로 주고받지 않는다(화면 입력만).

### 5-5. 외부 공유 금지·업무 외 사용 금지
1. 멘티 아이디어·팀 정보·관찰의견서·평가·정산액은 담당 업무 밖(다른 사업·개인 목적)으로 쓰지 않는다.
2. 멘토는 담당 멘티의 정보를 멘토링 종료 후 개인 기기에서 삭제한다. 다른 멘토·외부인에게 멘티 정보를 넘기지 않는다.
3. AI 도구(외부 챗봇 등)에 멘티·멘토 개인정보를 붙여 넣지 않는다. 플랫폼 내 AI 매칭은 시스템이 정한 항목만 전송한다.

### 5-6. 사고 신고 창구·대응 순서
| 단계 | 시한 | 담당 | 할 일 |
|---|---|---|---|
| 1 탐지·신고 | 즉시 | 발견자 → 운영사 PL | 어떤 정보가·누구에게·어떻게(잘못된 문자, 파일 유출, 계정 도용 의심, 화면 무단 열람) 인지 신고. 증거(문자 이력, 감사 로그 화면)를 보존 |
| 2 차단 | 1시간 이내 | 운영사 PL(+플랫폼 관리자) | 관련 계정 잠금, 대행 종료, 필요 시 전체 세션 무효화·키 교체(R-14 스크립트), 예약 문자 취소 |
| 3 영향 파악 | 24시간 이내 | 운영사 PL | 감사 로그·문자 이력·반출 기록으로 대상자 수·항목 확정. 문서로 정리 |
| 4 통지 | 법정 기한 내(개인정보 보호법상 통지·신고 기한 준수 — 현행 규정 확인) | {발주처} 개인정보 보호책임자 | 정보주체 통지(문자·이메일), 필요 시 감독기관 신고. 문안은 발주처가 확정 |
| 5 재발 방지 | 2주 이내 | 운영사 PL + 개발 | 원인별 조치(권한 축소, 코드 수정, 규정 개정)와 재점검. 이 문서 §3 진단표 갱신 |

신고 창구: 운영사 PL(행사 기본 설정의 `operator_contact`) → {발주처} 개인정보 보호책임자. 야간·휴일에도 1단계는 미루지 않는다.

### 5-7. 비밀키·설정 변경
| 항목 | 주기 | 담당 | 비고 |
|---|---|---|---|
| 담당자 비밀번호 | 180일 | 각자 | R-4 이후 시스템이 강제 |
| `CRON_SECRET`, `VIEW_AS_SECRET` | 분기 | 플랫폼 관리자 | 재배포 필요 |
| `SUPABASE_SERVICE_ROLE_KEY`, anon 키 | 반기 또는 담당자 이탈 시 | 플랫폼 관리자 | Supabase 대시보드 재발급 → Vercel 갱신 → 캐시 없이 재배포 |
| `SMS_KEK` | 반기 | 플랫폼 관리자 | R-12a 재래핑 스크립트 사용, 실패 시 행사별 자격증명 재등록 |
| 행사별 문자 API 키 | 행사 종료 시 해제 | 운영사 PL | `disableProgramSms` |
| 셀프 등록 확인코드 | 사용 직후 자동 소진, 재오픈 시 24시간 내 회수 | 플랫폼 관리자 | 안내서에 싣지 않는다 |
| `SMOKE_SEED_TOKEN`, `SMOKE_PASSWORD`(P34-A) | 분기 | 플랫폼 관리자 | Vercel(Production·Preview)과 GitHub Actions 시크릿 **두 곳을 동시에** 갱신. 점검 계정은 점검 외 시간에 비활성 유지(G9) |

---

## 6. 점검표(체크리스트)

### 6-1. 월간(운영사 PL, 소요 30분)
- [ ] 회원 명단에서 **소속 해제·잠금 누락** 확인: 이동·퇴사 담당자, 종료 그룹의 멘토·멘티 중 활동 없는 계정
- [ ] 감사 로그 [대행] 필터: 대행 건수 상위 3명·사유 확인, 업무 외 대행 여부
- [ ] 감사 로그 `export.*`·`*.docs_zip_export`·`report.export`: 반출 건별 사유·범위 적정성, 발주처 반출 건
- [ ] 감사 로그 `account.login_failed/login_locked`(R-2 이후): 반복 실패 계정 → 본인 확인
- [ ] 문자 이력: 오발송·실패 건, 인증번호·임시 비밀번호 문자 수신 번호 확인
- [ ] 반출 파일 파기: 30일 경과 파일 삭제 확인(§5-3)
- [ ] `program_sms_access_log` 에 `decrypt_fail`·`reauth_fail` 없음
- [ ] 발주처 옵션(`institution_docs_zip`·`institution_sms`·`institution_unmask`) 현재값과 요청서 대조

### 6-2. 분기(플랫폼 관리자 + 운영사 PL, 소요 2시간)
- [ ] Supabase 보안 어드바이저 재실행 — WARN 이상 0건, 신규 테이블 RLS 활성 여부(`alter table … enable row level security` 누락 검사)
- [ ] anon 키로 스토리지 버킷 목록·객체 접근이 거부되는지 확인(B8)
- [ ] 비밀키 로테이션(§5-7) 실행·기록, `BOOTSTRAP_TOKEN` 부재 확인
- [ ] `npm audit --audit-level=high` 0건, 주요 의존성(next·@supabase/*·xlsx·jszip·playwright-core) 최신 패치
- [ ] 백업·PITR 활성 확인, 복구 리허설 1회(R-10)
- [ ] 보존기간 도래 예정 행사 목록 확인, 파기 계획 통보(R-8b)
- [ ] 개인정보처리방침·동의 문안이 실제 수집 항목(§1)과 일치하는지, 변경 시 재동의 필요 여부
- [ ] 이 문서 §3 진단표를 코드 기준으로 갱신(상태 변경 항목·새 통제 항목)
- [ ] 담당자 보안 교육 1회(§5 규정 낭독·사고 사례 공유), 참석 기록

### 6-3. 행사 종료 시(운영사 PL)
- [ ] 그룹 종료(`ends_on`) 처리, 멘토·멘티 계정 행사 범위 비활성
- [ ] 행사별 문자 API 키 해제, 예약 문자 잔여 건 취소
- [ ] 정산 증빙 제출본 반출 후 파기 일정 기록
- [ ] 보존기간 시작일(행사 종료일) 기록 → R-8b 파기 스케줄 등록

---

## 7. 부록

### 7-1. 관련 법령 참고(일반 원칙 수준)
> 조문 번호와 세부 요건은 개정이 잦으므로 여기서 단정하지 않는다. 적용 전 {발주처} 법무·개인정보 보호책임자가 현행 규정을 확인한다.

- **개인정보 보호법** — 수집·이용 목적 명시와 동의, 목적 외 이용 금지, 처리 위탁 시 위탁자·수탁자 책임과 위탁 사실 공개, 안전성 확보조치(접근권한 관리·접근통제·암호화·접속기록 보관·점검), 개인정보처리방침 공개, 정보주체의 열람·정정·삭제·처리정지권, 보유기간 경과 시 파기, 유출 시 정보주체 통지·감독기관 신고.
- **개인정보의 안전성 확보조치 기준**(고시) — 접근권한의 최소 부여·변경 기록, 비밀번호 작성 규칙, 접속기록의 보관·점검, 개인정보 전송·저장 시 암호화(고유식별정보·비밀번호·바이오정보 등), 악성프로그램 방지, 물리적 안전조치.
- **정보통신망법** — 정보통신서비스 제공 시 이용자 정보 보호의 일반 원칙(개인정보 관련 조항 다수는 개인정보 보호법으로 이관됨).
- **전자서명·전자문서 관련** — 회차 확인 서명 이미지의 증빙 효력은 서명 시각·서명자 식별·무결성(`signatures.sha256`)으로 뒷받침한다.
- **국세 관련** — 원천징수 대상 지급 내역(정산·원천세) 증빙 보존 의무가 개인정보 보존기간보다 길 수 있다. R-8b 의 "정산 증빙 예외 보존"은 이 때문이다(결정 ⑦).

### 7-2. 용어
| 용어 | 설명 |
|---|---|
| RLS(Row Level Security) | Postgres 행 단위 접근 정책. anon/authenticated 클라이언트에 적용되고 service_role 은 우회한다 |
| service_role | Supabase 서버 전용 키. 서버 액션·API 라우트에서만 사용(`src/lib/supabase/admin.ts`) |
| 서명 URL(signed URL) | 비공개 버킷 파일을 제한 시간 동안만 열 수 있게 하는 임시 링크(`createSignedUrl`, 5~10분) |
| 봉투 암호화 | 데이터를 행사별 데이터 키(DEK)로 암호화하고, DEK 를 환경변수 마스터 키(KEK)로 다시 감싸는 방식(`src/lib/sms/secrets.ts`) |
| 마스킹 | 화면·파일에서 개인정보 일부를 `*` 로 가려 표시하는 것. 원문은 권한자가 의도적으로 열고 기록이 남는다 |
| 열람 감사 | 데이터를 **본 것** 자체를 기록하는 감사. 변경 감사와 구분 |
| 파기 대장 | 어떤 개인정보를 언제·누가·어떤 방법으로 파기했는지의 기록(R-8b `disposal_records`) |
| PITR | Point-in-Time Recovery. 특정 시점으로 DB 를 되돌리는 백업 방식 |
| 2FA/OTP | 2단계 인증 / 1회용 인증번호(문자) |
| 컨텍스트 쿠키 | 현재 행사·그룹 범위를 담은 서명 쿠키 `modu_ctx`(`src/lib/programs/context-cookie.ts`) |
| 대행 쿠키 | 대행 상태를 담은 서명 쿠키 `opmap_view_as`(`src/lib/auth/impersonation.ts`) |

### 7-3. 사용자 결정 필요 항목(모음)
| # | 결정 | 관련 |
|---|---|---|
| ① | 휴대폰 번호로 발급된 기존 계정(미변경)을 난수 임시 비밀번호로 일괄 재발급할지 | R-1 |
| ② | 개인정보 보존기간(사업 종료 후 3년 / 5년 / 행사별 설정) — 정산 증빙 보존 의무와 정합 | R-13a, R-8b |
| ③ | 발주처 화면·엑셀의 기본 마스킹 여부(권고: 마스킹, 옵션으로 해제) | R-4 |
| ④ | 워터마크 적용 범위(지급서류만 / 회차 사진·케이스 ZIP 포함) | R-5 |
| ⑤ | 2단계 인증을 운영사·발주처 전원 필수로 할지, 문자 비용 부담 | R-6 |
| ⑥ | 유휴 로그아웃 시간(30분/60분), 동시 세션 1개 제한 여부 | R-8a |
| ⑦ | 파기 승인자(PL/발주처)와 정산 증빙(정산서 PDF·서명 보고서) 예외 보존 여부 | R-8b |
| ⑧ | Supabase 플랜·PITR 애드온 비용 승인 | R-10 |
| ⑨ | 멘토 개인정보 동의를 플랫폼에서 받을지, 오프라인 수령 체크로 갈음할지 | R-13b |
| ⑩ | 침해사고 통지 책임 주체({발주처} 개인정보 보호책임자)와 연락망 | R-14 |

### 7-4. 이 문서의 갱신 규칙
- 진단표(§3)의 상태가 바뀌면 근거 파일과 함께 같은 행을 고친다(행을 지우지 않는다).
- 로드맵(§4) 항목이 완료되면 `CLAUDE.md §9` 의 P 항목 번호를 ID 옆에 적는다(예: `R-1 ✅ P34`).
- 결정(§7-3)이 내려지면 `CLAUDE.md §11 결정 기록`에 날짜와 함께 추가하고 여기서는 "결정됨 → §11 yyyy-mm-dd" 로 표기한다.
