# 모두의창업 플랫폼 — 구조 정리

> 정리일 2026-09-08 · 코드 기준 `claude/modu-platform-audit-tutute` · DB 기준 Supabase `modu` 마이그레이션 0001~0058
> 설계 원문 `docs/MODU-DESIGN.md`, 배포 절차 `docs/DEPLOY-RUNBOOK.md`, 세션 규칙 `CLAUDE.md`.

---

## 1. 기술 스택

| 계층 | 기술 |
|---|---|
| 프런트/서버 | Next.js 14.2 App Router · TypeScript · React Server Components + 서버 액션 |
| UI | Tailwind CSS · shadcn/ui(Radix) · lucide 아이콘 · react-hook-form + zod v4 |
| 데이터 | Supabase (Postgres · Auth · Storage · RLS) · 서비스롤은 서버 전용 |
| 문서 | playwright-core + @sparticuz/chromium (HTML → PDF) · pdf-lib(병합) · 서명 캔버스 |
| 파일 | xlsx (엑셀 일괄 등록·리포트·품의 내보내기) |
| 알림 | 알림 큐(`notifications`) + Vercel Cron 디스패치 · Solapi 문자(플랫폼 폴백 + 행사별 API) · nodemailer 이메일 · 인앱 |
| AI | `@anthropic-ai/sdk` — 멘토 매칭 정성 근거(`claude-opus-5`, 구조화 출력), 키 없으면 객관 점수만 |
| 테스트·품질 | `tsc --noEmit` · ESLint + 브랜딩 리터럴 검사 · `next build` · vitest(정산 계산 15건 + 매칭 점수 6건) |
| 배포 | Vercel (팀 `dalgmes-projects`, 프로젝트 `modu`, 리전 icn1, Cron 3개) |

---

## 2. 계층 구조

```
플랫폼 (한 배포)  ── 플랫폼 통합관리자 (users.is_platform_admin)
 └ programs (행사)  ── 발주처·용역사 기관명 = 브랜딩, 원천징수·정책·보고서 양식·문자 꼬리말
     ├ program_members (계정 ↔ 행사 소속, 다대다, **role = 그 행사 안에서의 역할**)
     ├ support_types (사업그룹 A·B·C·D…, 회차 수·기간·승계 원천)
     │    ├ support_type_members (그룹 명부: 멘토·스태프, 멘토별 원천징수 override)
     │    ├ support_type_documents (그룹별 필수서류 슬롯)
     │    └ cases (멘티 1명 = 1건, predecessor_case_id 로 그룹 간 승계)
     │         ├ mentor_assignments (활성 1명, is_active 로 교체 이력)
     │         ├ mentoring_logs (회차: 일시·장소·online/offline·단가 스냅샷·서명)
     │         ├ documents (doc_key 체계, mentor_visible)
     │         ├ observation_reports · reviews · signatures · survey_responses
     │         ├ round_extension_requests · mentor_withdrawal_requests · mentor_change_requests
     │         └ settlements (케이스×멘토 확정 스냅샷) → settlement_batches (지급 품의)
     ├ consulting_rates · operating_limits (단가·한도, 적용일 이력, 그룹 override)
     ├ document_templates (회차 보고서 양식, 행사/그룹 스코프) · survey_templates/questions
     ├ tag_catalog · mentee_profiles · mentor_profiles · match_recommendations
     ├ mentor_payment_docs · mentor_group_reviews · mentor_signatures
     └ program_sms_settings (+ program_sms_access_log) — 행사별 문자 API 봉투암호화
공통: users · audit_logs · notifications · scheduled_messages · app_settings · faqs · inquiries · board_* · operator_requests · supplement_requests · password_reset_otps · case_status_history
```

**격리 원칙(두 겹)**: RLS 헬퍼(`private.is_program_member/is_program_staff`) + 서비스롤 경로의 모든 스태프 조회·알림 수신자 조회에 컨텍스트 쿠키 `modu_ctx` 의 `program_id`(+`support_type_id`) 코드 필터. 새 페이지는 반드시 `requireContext(profile)`.

---

## 3. 데이터 모델 (45개 테이블)

| 묶음 | 테이블 |
|---|---|
| 행사·소속 | `programs` `program_members` `support_types` `support_type_members` `support_type_documents` |
| 계정 | `users`(role = 기본 역할, `is_platform_admin`) `password_reset_otps` · 행사 안 역할은 `program_members.role` |
| 케이스·회차 | `cases` `case_status_history` `mentor_assignments` `mentoring_logs` `round_extension_requests` `mentor_withdrawal_requests` `mentor_change_requests` `observation_reports` `reviews` `signatures` `documents` `supplement_requests` |
| 단가·정산 | `consulting_rates` `operating_limits` `settlements` `settlement_batches` `mentor_payment_docs` |
| 만족도 | `survey_templates` `survey_questions` `survey_responses` |
| 매칭·평가 | `tag_catalog` `mentee_profiles` `mentor_profiles` `match_recommendations` `mentor_group_reviews` |
| 양식·서명 | `document_templates` `mentor_signatures` |
| 문자·알림 | `program_sms_settings` `program_sms_access_log` `notifications` `scheduled_messages` `app_settings` |
| 커뮤니케이션 | `inquiries` `operator_requests` `faqs` `board_posts` `board_replies` |
| 감사 | `audit_logs`(INSERT-only, `actor_id = auth.uid()` 강제, `program_id` null = 플랫폼 행위) |

스토리지 버킷 3개(경로 `{caseId}/…` 전역 유일). 마이그레이션: 원본 0001~0045 중 선별 적용 + 모두의창업 0046~0058.

| 마이그레이션 | 내용 |
|---|---|
| 0046 | programs · 멤버십 · 플랫폼 관리자 플래그 |
| 0047 | support_types v2(동적 그룹) · 그룹 명부 |
| 0048 | case_status v2 · cases 정리 · 배정 종료 사유 · 자진 종료 요청 |
| 0049 | consulting_mode · 단가 · 한도 · mentoring_logs v2 · 추가 회차 요청 |
| 0050 | settlements · 품의 |
| 0051 | 멘토 변경 요청 · 만족도 양식 · 멘토 그룹 평가 · reviews 재사용 |
| 0052 | 단일본 doc_key 유니크 인덱스 v2 |
| 0053 | 레거시 5테이블 삭제 · app_settings · 서식 · 알림 · 감사 행사 범위 |
| 0054 | 매칭 프로필 · 추천 · 멘토 지급서류 |
| 0055 | 시드(행사 `modu-2026`, 그룹 A~D, 단가·한도, 만족도 양식, 키워드) |
| 0056 | 서류 공개 범위 · 관찰의견서 · 행사별 문자 설정 |
| 0057 | 멘티 기능(`signatures.log_id` 회차 귀속) |
| 0058 | 보고서 양식 스코프 · 서명 정책 · 멘토 서명 |
| 0059 | 행사별 역할 `program_members.role`(백필·기본값 트리거), RLS 헬퍼 `has_role`·`program_role` |

---

## 4. 상태머신 (`case_status` v2)

```
registered → mentor_assigned → in_progress ⇄ reassignment_pending
   → closure_requested ⇄ revision_requested
   → settlement_pending → settlement_batched → closed
   ※ withdrawn 은 어느 비종결 상태에서든
```

| 전이 | from → to | 주체 | 게이트 요지 | 부수효과 |
|---|---|---|---|---|
| T1 | ∅ → registered | 운영사 | — | 멘티 계정 발급, 승계 링크 |
| T2 | registered → mentor_assigned | 운영사 | 상태 = registered | 알림 멘토·멘티, 추천 채택 기록 |
| T3 | (유지) 멘토 교체 | 운영사 | ∉ {registered, closed, withdrawn} | 배정 `is_active` 교체, 회차는 케이스 누적 |
| T4 | mentor_assigned → in_progress | 멘토 | 1회차 등록 | 회차 검증 7항목 |
| T5 | in_progress/revision_requested → closure_requested | 멘토 | 회차 ≥ 필수 + 관찰의견서 + (설정) 서명·필수서류 | 정산 예상본, 알림 운영사 |
| T6 | closure_requested → revision_requested | 운영사 | — | reviews 기록, 알림 멘토 |
| T7 | closure_requested → settlement_pending | 운영사 | 스냅샷 저장 성공 후에만 전이 | settlements 확정, 정산서 PDF, 알림 멘토(금액)·발주처 |
| T8/T8' | settlement_pending ⇄ settlement_batched | 운영사 | 품의 draft 일 때만 제외 | batch_id |
| T9 | settlement_batched → closed | 발주처 | 품의 제출됨 | 알림 멘토·멘티, 만족도 안내 |
| T10 | 비종결 → withdrawn | 스태프 | — | 배정 해제, 이행 회차 부분 정산 |
| T11a | in_progress → reassignment_pending | 멘토 요청 → 운영사 승인 | 활성 배정 = 요청 멘토 | 배정 종료(사유 공개), 부분 정산 |
| T11b | → reassignment_pending (강제) | 운영사(사유 필수) | 활성 배정 존재 | 사유는 운영사·발주처만 열람, 부분 정산 |
| T12 | reassignment_pending → in_progress | 운영사 | 활성 배정 없음 | 새 멘토는 잔여 회차만 |

전이 상수는 `src/lib/workflow/transitions.ts` 한 곳. **UI 버튼 조건과 서버 게이트가 같은 상수를 읽는다.**

### 회차 규칙
1회차 = `mentoring_logs` 1행(웹작성/업로드 공통). 필수: 시작·종료 일시, 장소, 유형(online/offline), 내용 또는 파일·사진, **단가 스냅샷**. 검증: 회차 ≤ 필수 회차 + 승인 추가 / 같은 멘티·같은 날 합산(회차 ≤ 3, 유형별 금액 ≤ 상한) / 멘토 1일 최대 3건 / 시간 겹침 불가 / 멘티 서명 후 수정 잠금. 웹작성 회차는 저장·서명 시 양식 PDF 재생성.

---

## 5. 서류 체계 (`doc_key`)

| doc_key | 성격 | 강제 |
|---|---|---|
| `mentoring_report:{logId}` | 회차 보고서(업로드본 또는 양식 렌더본), 회차당 1 | 유니크 인덱스 접두 |
| `mentoring_photo:{logId}` | 회차 사진, 누적 | — |
| `observation_report` | 관찰의견서(=평가서), 케이스당 1 **단일본** | DB 유니크 인덱스 + delete-then-insert |
| `settlement_statement` | 정산서(확정 시 생성), 이력 보존 | — |
| `req:{key}` / `req1:{key}` | 그룹별 필수서류 슬롯 | `req1:` 유니크 |
| `case_doc` | 멘티 자유 첨부, `mentor_visible` 로 멘토 공개/비공개 | RLS + 코드 필터 |
| `application_pdf` | 등록 원본, 이력 보존 | — |

---

## 6. 정산

- 계산은 `src/lib/settlement/compute.ts` 의 `computeSettlement({rounds, withholding})` **한 곳**. 화면 예상액과 확정 저장액이 같은 함수에서 나온다. vitest 15건.
- 원천징수 방식 결정 순서: 그룹 내 멘토별 → 그룹 일괄 → 행사 기본. 파라미터(경비율·세율·지방세·과세최저한·절사)는 행사 설정, 스냅샷에 적용값 저장.
- 정산 단위 = 케이스 × 멘토(`settlements` unique). kind `closure`(종결) / `partial`(중도 종료 이행분).
- 흐름: 검수 승인 시 스냅샷 선저장 → `settlement_pending` → 품의 편성·제출(운영사) → 정산 확인(발주처) → `closed` → 지급 완료 표시. 확정 후 회차 변경은 다음 정산에 반영, 확정본 불변.
- 산출물: 정산서 PDF(`settlement_statement`), 품의 엑셀, 멘토 통보(인앱 + 문자, 금액 포함), 지급서류 미비 멘토 품의 차단(설정).

---

## 7. 권한·보안·감사

| 원칙 | 구현 |
|---|---|
| 신원 분리 | 스태프 특권·감사 실행자 = `getRealSessionProfile()`, 업무 명의 = `getSessionProfile()` (대행 view-as 시 다름) |
| 범위 강제 | RLS 에 의존하지 않고 코드에서 배정·행사 소속 직접 확인 |
| 가드 | `requireNextlab` `requireInstitution` `requireMentor` `requireMentee` `requireStaff` `requirePlatformAdmin` `mentorOfCaseOrNull` + `requireContext` |
| 행사별 역할 | 세션 프로필의 `role` 은 컨텍스트 쿠키의 행사에서의 `program_members.role` 로 치환된다(`auth/program-role.ts`). 명단·배정 후보·알림 수신자·매칭 후보는 멤버십 역할로 필터. 한 계정이 행사마다 다른 역할 가능 |
| 감사 | `audit_logs` INSERT-only, 실행자 강제, 대행은 `metadata.on_behalf_of`, 플랫폼 콘솔 행위는 `program_id null` |
| 재인증 | 멘토 지급서류 체크·행사별 문자 API 등록은 비밀번호 재입력, 대행 불가 |
| 문자 API 보안(7겹) | `SMS_KEK` 봉투암호화(DEK 래핑) · 힌트만 표시 · 재인증 · 접근 로그 · 서비스롤 전용 테이블 · 감사 · 키 회전 |
| 서버 액션 | 역할 불일치 시 `redirect()` 금지, `{ ok:false, error }` 반환 |
| 비밀값 | 코드에 없음(`.env.example` 만). Supabase `modu` 는 restart 와 별개 프로젝트 |

---

## 8. 화면·라우트 지도

| 영역 | 라우트 | 내용 |
|---|---|---|
| 공통 | `/login` `/change-password` `/reset-password` `/privacy-policy` `/terms` `/hub` `/hub/enter` | 통합 로그인, 허브(행사·그룹 배너, 자동 진입) |
| 플랫폼 | `/platform` `/platform/programs` `/platform/programs/[id]` `/platform/new` `/platform/users` `/platform/admins` `/platform/audit` `/platform/system` | 통합 현황 · 행사 관리·개설(설정 복제, 첫 운영사 계정) · 계정 통합 조회(비밀번호 재발급·활성화·행사 소속) · 플랫폼 관리자 · 통합 감사로그 · 시스템 상태 |
| 운영사 | `/nextlab/dashboard` `/nextlab/cases/new` `/nextlab/cases/[id]` `/nextlab/requests` `/nextlab/settlements` `/nextlab/settlements/batches/[id]` `/nextlab/mentors` `/nextlab/members` `/nextlab/members/import` `/nextlab/succession` `/nextlab/settings` `/nextlab/settings/sms-api` `/nextlab/reports` `/nextlab/inquiries` `/nextlab/qna` `/nextlab/mentee-board` `/nextlab/mentor-board` `/nextlab/view/[userId]` | 대시보드 타일, 멘티 등록·케이스 상세(배정·AI 추천·검수·정산·중도 종료·서류), 요청함, 정산·품의, 멘토 명단(지급서류·원천징수·평가), 회원관리·엑셀, 승계 개설, 운영 설정 8탭, 리포트, 문의·게시판, 대행 |
| 운영·공용 | `/admin/audit-logs` `/admin/settings/sms` `/admin/settings/faq` `/admin/settings/features` | 행사 감사로그, 문자 발송·예약, FAQ, 기능 토글(레거시) |
| 발주처 | `/institution/dashboard` `/institution/cases/[id]` `/institution/settlements` `/institution/settlements/[id]` `/institution/reports` `/institution/mentors` `/institution/requests` `/institution/guide` `/institution/install` 게시판 | 열람, 정산 확인(T9), 리포트 |
| 멘토 | `/mentor/dashboard` `/mentor/cases/[id]` `/mentor/settlements` `/mentor/profile` `/mentor/signature` `/mentor/qna` `/mentor/guide` `/mentor/install` | 회차·관찰의견서·종결·요청, 정산 내역, 매칭 프로필, 서명 등록 |
| 멘티 | `/mentee/dashboard` `/mentee/rounds` `/mentee/survey` `/mentee/documents` `/mentee/inquiries` `/mentee/consent` | 할 일 카드, 회차 서명, 만족도, 필수·자유 서류, 문의 |
| API | `/api/setup` `/api/cron/dispatch-notifications` `/api/cron/overdue-reminders` `/api/cron/mentor-weekly-reminder` `/api/reports/export` `/api/nextlab/batches/[id]/export` | 부트스트랩(1회), Cron(`CRON_SECRET`), 엑셀 내보내기 |

PDF 를 만드는 페이지 5개(`/mentor/cases/[id]` `/mentee/rounds` `/nextlab/cases/[id]` `/nextlab/requests` `/institution/cases/[id]`)는 `maxDuration = 60` + Chromium 트레이싱.

---

## 9. 코드 디렉터리 지도

| 경로 | 역할 |
|---|---|
| `src/app/(auth|hub|platform|nextlab|institution|mentor|mentee|admin)` | 라우트 그룹별 레이아웃(가드 + 컨텍스트) 과 페이지 |
| `src/lib/auth` | 가드, 세션·대행, 계정 발급(`admin-accounts.ts`), 회원 액션, 비밀번호 재설정 |
| `src/lib/programs` | 브랜딩(`branding.ts`), 행사·그룹 조회, 컨텍스트 쿠키(`context.ts`), 허브 진입 |
| `src/lib/workflow` | 전이 상수(`transitions.ts`), 케이스(`cases.ts`), 회차(`rounds.ts`), 종결(`closure.ts`), 검수(`review.ts`), 품의(`batches.ts`), 중도 종료(`withdrawal.ts`), 멘티(`mentee.ts`), 승계(`succession.ts`), 서류(`case-documents.ts`) + `*-actions.ts` |
| `src/lib/settlement` | `compute.ts`(단일 계산) `policy.ts`(원천징수 결정) `rates.ts`(단가·한도 이력) `settle.ts`(스냅샷·정산서) `export.ts` `labels.ts` `actions.ts` |
| `src/lib/documents` | 회차 보고서 양식 해석·PDF 재생성·서명 정책(`round-report.ts`), 렌더 |
| `src/lib/matching` | 객관 점수(`score.ts`) 추천 생성·모델 근거(`recommend.ts`) 액션 |
| `src/lib/settings` `src/lib/mentors` `src/lib/reports` `src/lib/platform` `src/lib/import` `src/lib/sms` `src/lib/notifications` `src/lib/data` | 운영 설정, 멘토 명단, 리포트 계산·내보내기, 플랫폼 콘솔 데이터·액션, 엑셀 가져오기, 행사별 문자 보안, 알림 큐·디스패치, 조회 전용 모듈 |
| `src/components/*` | 영역별 UI (cases, settlement, settings, matching, platform, hub, common …) |
| `src/types` | `database.ts`(Supabase 생성) `case-status.ts`(상태 메타) |
| `supabase/migrations` | 0001~0058 |
| `scripts` | `check-brand-strings.sh`(브랜딩 리터럴 0건 강제) `bootstrap-admin.mjs` |
| `docs` | 설계·조사·런북·핸드북 |

---

## 10. 알림·Cron

| Cron | 주기 | 역할 |
|---|---|---|
| `/api/cron/dispatch-notifications` | 5분 | `notifications` 큐 pending → 인앱·문자(행사별 API → 플랫폼 폴백)·이메일 발송, `payload.message` 를 문자 본문에 부착 |
| `/api/cron/overdue-reminders` | 매일 00:00 UTC | 정체 회차·미처리 요청 리마인더 |
| `/api/cron/mentor-weekly-reminder` | 월 03:30 UTC | 멘토 주간 안내(설정으로 on/off) |

문자 실패는 try/catch 로 격리되어 본 작업을 막지 않는다. 시스템 상태 페이지에서 마지막 발송 시각과 대기 건수로 Cron 생존을 본다.

---

## 11. 인프라·배포

| 항목 | 값 |
|---|---|
| GitHub | `dalgme/modu`, 작업 브랜치 `claude/modu-platform-audit-tutute` (현재 Vercel Production) |
| Supabase | `modu` (`osrigknfrzsqjrgihgao`, ap-northeast-2) |
| Vercel | 팀 `dalgmes-projects` · 프로젝트 `modu` · `https://modu-dalgmes-projects.vercel.app` · icn1 · Node 24 |
| 환경변수 | 필수 `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY` `NEXT_PUBLIC_APP_URL` `CRON_SECRET` · 권장 `VIEW_AS_SECRET` `SMS_KEK` · 선택 `SOLAPI_*` `SMTP_*` `ANTHROPIC_API_KEY` · 1회 `BOOTSTRAP_TOKEN`(사용 후 삭제) |
| 규칙 | `NEXT_PUBLIC_` 은 Config 타입, 나머지는 Secret · Vercel Authentication 은 Disabled · `NEXT_PUBLIC_*` 변경 시 캐시 없이 재배포 |
| 검증 4종 | `npm run typecheck` · `npm run lint`(ESLint + 브랜딩 검사) · `npm run build` · `npm run test` |

## 12. 불변 규칙 (원본에서 사고가 났던 지점)

1. 스태프 특권·감사 실행자는 실제 신원, 업무 명의는 유효 신원.
2. RLS 를 범위 강제에 쓰지 말고 코드에서 직접 확인.
3. `audit_logs` insert 에러를 삼키지 말 것(조용히 유실).
4. PDF 라우트는 `maxDuration = 60`.
5. 문자 발송은 try/catch 격리.
6. `NEXT_PUBLIC_*` 변경 시 캐시 없이 재배포.
7. 서버 액션에서 역할 불일치 시 `redirect()` 금지.
8. 단일본 doc_key 는 DB 유니크 인덱스.
9. 회차 카운트는 케이스 단위(멘토 변경 시 리셋 금지).
10. 기관명 리터럴 금지, `{client}` `{operator}` `{program}` 플레이스홀더만.
