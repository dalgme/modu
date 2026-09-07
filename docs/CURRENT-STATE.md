# 현재 코드 상태 조사 — restart 원본 그대로인 modu 코드 전수 조사

> 조사 기준: `dalgme/modu` 커밋 `b387ef2` (2026-09-07) — restart 원본 코드 **개조 착수 전** 상태.
> 목적: CLAUDE.md §3(진행 단계)·§4(서류 체계)를 확정하기 전에, 지금 코드가 **어디서 역할·상태·서류를 판단하는지**를
> 전부 적어 두어 개조 시 빠뜨리는 곳이 없게 한다.
> 조사 방법: `src/`·`supabase/migrations/` 전수 grep + 전이 함수 전문 열람. 추정 없음.

---

## 0. 요약

| 항목 | 결과 |
|---|---|
| `user_role` 사용처 | 앱 코드 **53개 파일**, 마이그레이션 **9개 파일**. enum 값 자체를 바꾸지 않으면 **라벨·라우트 폴더명·문구**만 교체하면 된다. |
| `case_status` 전이 | **21개 전이 지점**(서버 액션 20 + Cron 자동 1). 상태 15개 중 UI 진행바에는 11개만 노출. |
| `doc_key` | 고정 키 **19개 + 접두 패턴 4종**(`form_*`, `contractor_*_{i}`, `si:*`, `post:*`). DB 유니크 인덱스(단일본)는 `consulting_report`·`support_application`·`form_*` **3종만**. |
| 원본 고유 문자열 | `src/` 안에 **391줄**(파일 기준 약 140개). 마이그레이션 110줄, `public/sw.js` 1줄. |

---

## 1. `user_role` 이 쓰이는 곳

### 1-1. 정의
| 계층 | 위치 | 내용 |
|---|---|---|
| DB enum | `supabase/migrations/0002_core_schema.sql:11` | `create type user_role as enum ('institution','nextlab','mentor','mentee')` |
| TS 타입 | `src/types/database.ts` (생성물) → `src/lib/auth/roles.ts:3` | `UserRole = Enums<'user_role'>` |
| 라벨 | `src/lib/auth/roles.ts:5` `ROLE_LABELS` | institution=진흥원 / nextlab=넥스트랩 / mentor=멘토 / mentee=멘티 |
| 홈 경로 | `src/lib/auth/roles.ts:14` `roleHome()` | `/institution/dashboard` `/nextlab/dashboard` `/mentor/dashboard` `/mentee/dashboard` |
| 스태프 판정 | `src/lib/auth/roles.ts:28` `isStaffRole()` | institution ∪ nextlab |

### 1-2. 앱 계층 가드 (`src/lib/auth/guards.ts`)
| 함수 | 신원 기준 | 실패 시 동작 | 용도 |
|---|---|---|---|
| `requireInstitution` / `requireNextlab` / `requireStaff` | **실제** 신원 | `redirect()` | 스태프 콘솔 페이지·스태프 서버 액션 |
| `requireMentor` / `requireMentee` / `requireRole([...])` | **유효** 신원(대행 반영) | `redirect()` | 멘토·멘티 페이지 |
| `roleOrNull` / `mentorOrNull` | 유효 신원 | `null` 반환 | 멘토 서버 액션 (대행 중 튕김 방지) |
| `realRoleOrNull` | 실제 신원 | `null` 반환 | anon 클라이언트로 쓰기하는 액션 |
| `mentorOfCaseOrNull(caseId)` | 유효 신원 + 활성 배정 확인 | `null` 반환 | 케이스 스코프 멘토 액션 (RLS 대신 코드로 배정 확인) |

### 1-3. 라우트 그룹 레이아웃 (역할 → 폴더)
| 폴더 | 가드 | 비고 |
|---|---|---|
| `src/app/(institution)/layout.tsx` | `requireInstitution()` | 센터 콘솔 |
| `src/app/(nextlab)/layout.tsx` | `requireNextlab()` | 운영총괄 콘솔 — **폴더명·URL 접두 `/nextlab` 이 역할 키와 결합** |
| `src/app/(mentor)/layout.tsx` | `requireMentor()` | |
| `src/app/(mentee)/layout.tsx` | `requireMentee()` (개인정보 동의 강제) | |
| `src/app/(admin)/layout.tsx` | `requireStaff()` + 내부에서 `role === 'nextlab' / 'institution'` 분기 | 감사로그·설정 |

### 1-4. 역할 리터럴을 직접 비교·조회하는 곳 (라벨 교체와 별개로 **enum 값이 바뀌면** 전부 손봐야 하는 지점)
| 파일 | 패턴 | 목적 |
|---|---|---|
| `src/lib/workflow/application.ts` | `.eq('role','nextlab')`, `.eq('role','institution')` | 검수·승인 알림 수신자 조회 |
| `src/lib/workflow/application-actions.ts` | `.eq('role','nextlab')` | 송신 알림 수신자 |
| `src/lib/workflow/mentoring.ts` | `.eq('role','nextlab')` | 1회차 일지 알림 |
| `src/lib/workflow/payment.ts` | `.eq('role','nextlab'/'institution')` | 지급 알림 |
| `src/lib/workflow/payment-attach-actions.ts` | `.eq('role','institution')` | 지급승인 대기 알림 |
| `src/lib/workflow/support-items-actions.ts` | `.eq('role','nextlab')` | 증빙 제출 알림 |
| `src/lib/workflow/case-lifecycle.ts` | `.eq('role','institution')` | 수동접수 알림 |
| `src/lib/notifications/dispatch.ts` | `.eq('role','institution')` | 승인 지연 독촉 |
| `src/lib/notifications/mentor-weekly-reminder.ts` | `role !== 'mentor'` | 주간 리마인더 대상 |
| `src/lib/workflow/supplement-actions.ts` | `role === 'nextlab'/'institution'/'mentor'/'mentee'` (8곳) | 보완요청 권한 분기 |
| `src/lib/workflow/payment-docs-actions.ts` | `role === 'nextlab'/'mentor'/'mentee'` | 지급서류 업로드 권한 |
| `src/lib/workflow/case-editor.ts` | `role === 'nextlab'/'mentor'` | 임시수정권한 대상 |
| `src/lib/workflow/attachment-forms-actions.ts` | `role === 'mentor'`, `includes(profile.role)` | 서식 생성 권한 |
| `src/lib/data/support-items.ts` | 4역할 전부 비교 | 지원신청 편집 권한(`editable = mentee ∨ mentor`) |
| `src/lib/data/members.ts`, `src/lib/data/cases.ts` | `.eq('role','mentor'/'mentee')` | 회원·멘토 목록 |
| `src/lib/auth/impersonation.ts` | `role === 'nextlab'` / `!== 'nextlab'` | **대행(view-as)은 nextlab 만 가능** |
| `src/lib/auth/actions.ts`, `identifier.ts`, `admin-accounts.ts` | `role === 'mentee'`, `role: 'mentee'` | 멘티 휴대폰 로그인·계정 발급 |
| `src/app/api/setup/route.ts` | `role: 'institution'` | **부트스트랩 최초 계정은 institution** |
| `src/app/api/admin/users/route.ts` | 4역할 비교 | 계정 발급 API 권한 |
| `src/components/nextlab/view-as-dashboard.tsx`, `view-as-case-detail.tsx`, `members-manager.tsx` | 역할 분기 | 대행 화면 |
| `src/components/board/qna-board.tsx`, `src/components/admin/sms-send-list.tsx` | 역할 분기 | 게시판·문자 대상 |

### 1-5. DB 계층 (RLS)
| 마이그레이션 | 참조 수 | 내용 |
|---|---|---|
| `0002_core_schema.sql` | 2 | enum 정의, `users.role` |
| `0003_rls.sql` | 33 | 정책 대부분이 `private.is_staff()` 등 헬퍼 경유. `public.can_access_case()` 정의 |
| `0005_harden_helpers.sql` | 36 | `private.is_staff / is_institution / is_nextlab / is_mentor_of / is_mentee_of` SECURITY DEFINER |
| `0028` `0032` `0034` `0036` `0037` `0039` | 2~12 | 문의·FAQ·운영요청·게시판·문자설정·보완요청 정책 |

**판단** — CLAUDE.md §1 대로 역할 4개를 유지하므로 **enum 값·RLS 헬퍼는 손대지 않는다.**
교체 대상은 (a) `ROLE_LABELS`, (b) 라우트 그룹 폴더 `(nextlab)` + URL 접두 `/nextlab`(선택), (c) 문구 속 "진흥원/넥스트랩"뿐이다.
`nextlab` 키를 `letz` 같은 값으로 바꾸려면 위 1-4 표의 전 파일 + 마이그레이션 9개 + `roleHome` + 폴더명을 동시에 바꿔야 하므로 **권장하지 않는다**(라벨만 "(주)렛츠"로).

---

## 2. `case_status` 상태 전이 — 서버 액션 전수

### 2-1. 상태 정의 (`src/types/case-status.ts`)
DB enum(0002 + 0014 `withdrawn` + 0041 `under_review`)과 TS `CASE_STATUSES` 는 일치하며 **15개**.
UI 진행바 `CASE_STEP_ORDER` 는 11개(접힘 상태 `contractor_registered`→5단계, `execution_docs_submitted`→10단계, `rejected`→8단계 공유, `withdrawn`→0).

### 2-2. 전이 표

| # | from → to | 실행 주체 (가드) | 서버 액션 → 전이 함수 | 상태 게이트 (DB 조건부 update) | 부수효과 | UI 버튼 활성 조건 |
|---|---|---|---|---|---|---|
| 1 | (없음) → `registered` | institution `requireInstitution` | `case-actions.ts registerCase` → `cases.ts createCase` | 없음(insert) | 이력·감사, **멘티 계정 자동 발급**(`inviteMentee`, 임시비번=휴대폰) | `(institution)/cases/new` |
| 2 | `registered` → `mentor_assigned` | nextlab `requireNextlab` | `case-actions.ts assignMentorAction` → `cases.ts assignMentor` | `.eq('status','registered')` (실패 시 배정 롤백) | 알림 `mentor_assigned` → 멘토 + 멘티 | `nextlab/cases/[id]/page.tsx:75` `assignable={status==='registered'}` |
| 3 | (상태 유지) 멘토 **재배정** | nextlab | `reassignMentorAction` → `cases.ts reassignMentor` | 코드 검사: `registered`·`withdrawn`·`rejected` 불가 | 활성 배정 교체(`is_active`), 이력 from=to, 알림 새 멘토 | 같은 파일 `:79-84` `reassignable` = 멘토 있음 ∧ ¬registered ∧ ¬withdrawn ∧ ¬rejected ∧ ¬payment_approved |
| 4 | (모든 진행 상태) → `registered` 멘토 **회수** | nextlab | `recallMentorAction` → `cases.ts recallMentor` | 코드 검사: `registered`·`withdrawn`·`rejected`·`payment_approved` 불가. **update 에 status 조건 없음** | 배정 비활성화, 이력·감사 | `mentor-assign-panel.tsx:165` `reassignable` 과 동일 조건 (⚠ 액션은 `payment_approved` 를 막지만 재배정 조건과 같아 정합) |
| 5 | `mentor_assigned` → `contacted` | mentor `mentorOrNull` + `assertMentorOfCase` | `log-actions.ts recordContactAction` → `mentoring.ts recordContact` | `.eq('status','mentor_assigned')` | 이력·감사 | 멘토 케이스 상세 |
| 6 | `mentor_assigned`∨`contacted` → `log_completed` (**웹 일지 1회차**) | mentor | `log-actions.ts` → `mentoring.ts submitMentoringLog` | `.in('status',[mentor_assigned,contacted])` — 2회차부터는 상태 불변 | **회차 상한**: `mentoring_logs` 케이스 단위 count ≥ `logRequirement().max` 면 거부. 알림 `log_completed` → nextlab 전원. 이력 `from_status` 는 `'contacted'` 로 **하드코딩** | `/mentor/cases/[id]/log` |
| 7 | `mentor_assigned`∨`contacted` → `log_completed` (**보고서 파일 첨부**) | mentor | `mentoring-report-actions.ts attachMentoringReportAction` | 동일 `.in([...])` | documents `mentoring_report` insert. 알림 없음 | `mentor-workflow.tsx` 첨부 탭 |
| 8 | `log_completed` → `application_drafted` | mentor (nextlab 재생성은 **전이 안 함**) | `consulting-report-actions.ts generateConsultingReportAction` / `uploadConsultingReportAction` → `enterApplicationDraftedIfLogCompleted` | `.eq('status','log_completed')` (멱등) | `consulting_report` 생성/교체 | `mentor-workflow.tsx` `consultingEnabled = roundsDone ≥ min` |
| 9 | `log_completed` → `contractor_registered` (레거시 접힘) | mentee **또는** mentor (`getSupportContext().editable`) | `support-items-actions.ts submitPreSupportAction` | `.eq('status','log_completed')` — 다른 상태면 제출시각만 갱신 | 알림 `contractor_registered` → 멘토 | `/mentee/pre-support`, `/mentor/cases/[id]/pre-support` |
| 10 | `log_completed`∨`application_drafted`∨`contractor_registered`∨`rejected` (+폐업: `mentor_assigned`∨`contacted`) → `under_review` | mentor (`mentorOrNull` + 배정 직접 확인) | `application-actions.ts submitApplicationAction` | `.in('status', SUBMITTABLE_STATUSES[+CLOSURE_EXTRA])` | 선행조건: 경영개선=신청서 최종저장 ∧ 공사업체 서류 완료 / 폐업=`payment_application_file` 존재. 알림 `under_review` → nextlab 전원 **+ 즉시 SMS + 이메일**. 대행 시 감사 metadata `on_behalf_of` | `mentor-workflow.tsx:104` `submitEnabled` |
| 11 | `under_review` → `reviewed` (검수 승인) | nextlab `requireNextlab` | `application-actions.ts reviewAction` → `application.ts submitReview('approved')` | 코드 검사 + `.eq('status','under_review')` | `reviews` insert. 알림 `reviewed` → institution 전원 **+ SMS + 이메일** | `nextlab/cases/[id]/page.tsx:95` `status==='under_review'` |
| 12 | `under_review` → `application_drafted` (보완요청) | nextlab | 같은 함수 `submitReview('revision_requested')` | 동일 | 알림 `revision_requested` → 담당 멘토 | 동일 패널 |
| 13 | step 1~6 (비종결) → `reviewed` **수동 접수(오프라인)** | staff `requireStaff` | `case-lifecycle-actions.ts manualReceiveApplicationAction` → `case-lifecycle.ts manualReceiveApplication` | `step < reviewed.step` + 낙관적 `.eq('status', 현재값)` | 알림 `reviewed` → institution + SMS + 이메일 | `case-row-actions.tsx:35` `canReceive = step>0 ∧ step<reviewed.step` |
| 14 | `reviewed` → `approved` / `rejected` | institution `requireInstitution` | `application-actions.ts approvalAction` → `application.ts approveOrRejectApplication` | `.eq('status','reviewed')`; 반려 시 사유 필수 | `approvals(support)` insert. 알림 `approved`/`rejected` → nextlab 전원 + 멘토 + 멘티 | `institution/cases/[id]/page.tsx:93` `status==='reviewed'` |
| 15 | `approved` → `notified` (**자동**) | 시스템 (Cron `dispatch-notifications`) | `notifications/dispatch.ts maybeMarkNotified` | `.eq('status','approved')` — `approved` 알림 발송 성공 시 | 이력 `changed_by: null` | 없음 |
| 16 | `approved` → `notified` (수동) | staff | `case-lifecycle-actions.ts markNotifiedAction` → `markNotified` | `.eq('status','approved')` | 이력·감사 | `case-row-actions.tsx:36`, `case-lifecycle-panel.tsx:44` `status==='approved'` |
| 17 | `notified` → `execution_docs_submitted` (접힘) | mentee 또는 mentor | `support-items-actions.ts submitPostSupportAction` | `.eq('status','notified')` | 알림 `execution_docs_submitted` → nextlab 전원 (템플릿 미정의 → GENERIC 문구) | `/mentee/post-support` |
| 18 | `execution_docs_submitted`∨`payment_application_drafted` → `payment_application_drafted` (웹 작성) | nextlab | `payment-actions.ts draftPaymentAction` → `payment.ts draftPaymentApplication` | `.in('status', PAYMENT_DRAFTABLE)` | `payment_applications` upsert + PDF `payment_application`. 알림 `payment_application_drafted` → institution (템플릿 미정의) | `nextlab/cases/[id]/page.tsx:103` `status==='execution_docs_submitted'` |
| 19 | `execution_docs_submitted` → `payment_application_drafted` (파일 첨부) | nextlab | `payment-attach-actions.ts attachPaymentFileAction` | 사전 검사 `PAYMENT_DRAFTABLE` + `.eq('status','execution_docs_submitted')` | documents `payment_application_file`. 알림 institution | 동일 |
| 20 | `payment_application_drafted` → `payment_approved` / `execution_docs_submitted`(반려) | institution | `payment-actions.ts paymentApprovalAction` → `payment.ts approvePayment` | `.eq('status','payment_application_drafted')` | `approvals(payment)` insert. 알림 `payment_approved`/`rejected` | `institution/cases/[id]/page.tsx:95` |
| 21 | (비종결 전부) → `withdrawn` | staff | `case-lifecycle-actions.ts withdrawCaseAction` → `withdrawCase` | `TERMINAL=[withdrawn,payment_approved]` 제외 + 낙관적 `.eq(현재값)` | 활성 배정 해제. 사유 필수 | `case-withdraw-button.tsx:22` withdrawn/payment_approved 면 숨김 |

상태를 바꾸지 않지만 상태를 **읽어 게이트하는** 액션: `application-attach-actions.ts` (`SAVEABLE=[log_completed,contractor_registered,application_drafted,rejected]`), `edit-grant-actions.ts` (`reviewed` 에서만 임시수정권한 개설), `notifications/mentor-weekly-reminder.ts` (`PENDING_APPLY_STATUSES`), `dispatch.ts queueOverdueReminders` (`reviewed` 3일 초과 독촉).

### 2-3. 원본 상태머신 그림 (현행)
```
registered ──(2)──> mentor_assigned ──(5)──> contacted ──(6/7)──> log_completed
    ▲                    │                       │                     │
    └────(4 회수)────────┴───────────────────────┘                     ├(8)→ application_drafted ─┐
                                                                       ├(9)→ contractor_registered ┤
                                                                       └───────(10 송신)───────────┴→ under_review
under_review ─(11)→ reviewed ─(14)→ approved ─(15/16)→ notified ─(17)→ execution_docs_submitted ─(18/19)→ payment_application_drafted ─(20)→ payment_approved
     │(12 보완)          ▲                │(14 반려)                                                          ▲       │(20 반려)
     └→ application_drafted   (13 수동접수: step1~6 →)   rejected ──(10 재송신)→ under_review                └───────┘
어느 비종결 상태 ──(21)→ withdrawn
```

### 2-4. 모두의창업 개조 시 판단 재료
- **지급 축(#17~#20)과 승인 축(#11~#16)** 은 보조금 절차. 센터 승인 게이트가 없으면 `under_review`~`payment_approved` 9개 상태와 전이 10개, 패널 4개(`ReviewPanel`·`ApprovalPanel`·`PaymentApprovalPanel`·지급신청 카드)를 제거·대체.
- **회차 카운트는 이미 케이스 단위**(#6: `mentoring_logs` 를 `case_id` 로 count) → 멘토 변경 시 리셋되지 않음. CLAUDE.md §2-3 요건 충족. `mentoring_logs.mentor_id` 도 이미 존재.
- 회차 상한은 `src/lib/workflow/mentor-tasks.ts:33 logRequirement()` 한 곳(경영개선 2~3 / 폐업 1~2). 여기를 `{min:4,max:4}` 로 바꾸면 #6·#8·`mentor-workflow.ts` 의 `roundsDone` 판정이 함께 바뀐다.
- #6 `roundsDone` 은 **웹 일지 + 보고서 파일 첨부 건수 합산**(`mentor-workflow.ts:99`). 모두의창업에서 "회차 = 보고서 등록" 으로 정의하면 이 합산 규칙을 다시 정해야 한다.
- `mentoring_logs` 컬럼: `case_id, mentor_id, visited_at, content` + 0009(`place, topic, difficulties, result`) + 0017(`duration_minutes`). **`mode`(온라인/오프라인)·`unit_price_snapshot` 없음** → §2-4 정산은 새 마이그레이션 필요.

---

## 3. `doc_key` 카탈로그

### 3-1. 성격 분류 기준
| 성격 | 정의 | 강제 수단 |
|---|---|---|
| **단일본** | 케이스당 1건, 재등록 = 교체 | DB 부분 유니크 인덱스 `documents_singleton_doc_key_idx` (0045) |
| **누적** | 여러 건 허용(회차·업체·항목별) | 없음 |
| **이력보존** | 재등록해도 이전본 유지, 열람은 최신본 | 없음(의도적으로 인덱스 제외) |

### 3-2. 카탈로그

| doc_key | 이름 | 성격 | 강제 | 업로드/생성 주체 | 코드 위치 | modu 판단 |
|---|---|---|---|---|---|---|
| `consulting_report` | 컨설팅 결과보고서(일지 병합 생성본 또는 업로드 완성본) | **단일본** | DB 인덱스 + 앱 `deleteExistingConsultingReports` | mentor 생성/업로드, nextlab 재생성 | `consulting-report.ts:369`, `consulting-report-actions.ts:142` | 4회 보고서 병합본이 필요하면 유지, 아니면 제거 |
| `support_application` | 지원신청서(웹 작성 → PDF) | **단일본** | DB 인덱스 | mentor | `application.ts:151` | 보조금 신청서 → 제거 후보 |
| `form_<key>` (10종: `business_application` `business_plan` `consent_privacy` `consent_admin_info` `pledge_no_overlap` `pledge_warranty` `outdoor_ad_exempt` `cctv_policy` `change_request` `withdrawal_request`) | 붙임서식 생성본 | **단일본(서식별)** | DB 인덱스 `starts_with('form_')` | staff/mentor (`attachment-forms-actions.ts`) | `attachment-forms.ts:74`, 키 목록 `documents/templates.ts:241` | 서식 21종 마이그레이션은 미적용 상태 → 모두의창업 서식으로 전면 교체 |
| `application_pdf` | 신청서 원본 PDF(기관 제출본) | **이력보존** | 없음(0045 주석에 방침 명시) | institution | `case-actions.ts:32` | 멘티 등록 시 첨부 원본이 있으면 유지 |
| `business_plan_attachment` | 사업계획서 첨부 | 누적(교체 로직 없음) | 없음 | nextlab | `case-actions.ts:178` | — |
| `mentoring_report` | 멘토링 보고서 완성본 파일 | **누적(회차별)** | 없음 — 상한은 `logRequirement().max` 로 웹일지와 합산 검사 | mentor | `mentoring-report-actions.ts:70`, 상수 `data/mentoring-logs.ts:152` | **모두의창업 `mentoring_report`(4회 누적) 그대로 재사용** |
| `mentoring_photo:{logId}` (레거시 `mentoring_photo`) | 멘토링 현장사진 | 누적 | 없음 | mentor | `mentoring.ts:39`, `data/mentoring-logs.ts:64` | 유지 |
| `applicant_biz_reg` | 멘티기업 사업자등록증 | 누적 | 없음 | mentor | `mentor-doc-actions.ts`, 상수 `data/mentor-workflow.ts:9` | 필요 시 그룹별 필수서류로 |
| `support_application_file` | 지원신청서 완성본 파일(업로드) | 누적(0045 명시 비대상) | 없음 | mentor | `application-attach-actions.ts:89` | 제거 후보 |
| `contractor_estimate_{i}` `contractor_estimate_compare_{i}` `contractor_biz_reg_{i}` `contractor_outdoor_ad_{i}` `contractor_extra_{i}` | 공사업체 서류(업체 i) | 누적 | 없음 | mentor | `data/contractor-config.ts:59`, `mentor-doc-actions.ts:31` | 제거 |
| `si:{contractorId}:{docType}` (docType: `biz_reg` `estimate` `compare_estimate` `outdoor_ad_permit`) | 지원신청(사전) 신청단위 서류 | 누적 | 없음 | mentee / mentor 대리 | `support/catalog.ts:72`, `support-items-actions.ts` | 제거 |
| `post:{docType}` (`tax_invoice` `transaction_statement` `transfer_confirm` `photo_before` `photo_after`) | 자금신청(사후) 지급 증빙 | 누적 | 없음 | mentee / mentor 대리 | `support/catalog.ts:75` | 제거 |
| `payment_application` | 지급신청서(웹 생성 PDF) | 누적(재작성마다 쌓임) | 없음 | nextlab | `payment.ts:118` | 제거 |
| `payment_application_file` | 지급(지원금)신청서 파일 | 누적 | 없음 | nextlab / mentor | `payment-attach-actions.ts`, `payment-doc-keys.ts` | 제거 |
| `pledge_no_overlap_file` `payment_construction_detail` `payment_tax_invoice` `payment_transfer_proof` `payment_bankbook` `payment_contractor_biz_reg` | 폐업 지급 서류 6종 | 누적 | 없음 | mentor / mentee / nextlab | `payment-doc-keys.ts`, `payment-docs-actions.ts` | 제거 |
| *(DB 설정)* `support_type_documents.doc_key` | 지원유형별 필수서류 정의 | — | — | nextlab 설정 화면 | `support-type-actions.ts:71`, 읽기 `data/support-types.ts` | **안내 화면(`support-scope-guide.tsx`) 표시 전용** — 업로드 흐름과 연결돼 있지 않음. 그룹별 필수서류로 쓰려면 배선 필요 |

`documents` 의 ZIP 묶음 분류(`data/application-bundle.ts`)는 `consulting_report` / `support_application(_file)` / `applicant_biz_reg` / `form_pledge_no_overlap`·`pledge_no_overlap_file` / `contractor_*`·`si:*` 5개 폴더만 인식한다.

### 3-3. 신규 키 `evaluation_report` 에 대한 함의
- **단일본**으로 확정되면 0045 인덱스의 `where doc_key in (...)` 목록에 추가하는 **새 마이그레이션**을 쓰고, 앱 쪽 업로드 액션도 delete-then-insert 로 짝을 맞춘다(`consulting_report` 패턴 = `consulting-report-actions.ts:137-150`).
- **회차별 누적**이면 `mentoring_report` 패턴(회차 상한 검사)을 그대로 따른다.
- 어느 쪽이든 업로드 UI 는 `CaseDocUpload`(`components/cases/case-doc-upload.tsx`) 재사용.

---

## 4. 원본 고유 문자열 잔재

### 4-1. `src/` 용어별
| 용어 | 줄 수 | 파일 수 | 비고 |
|---|---|---|---|
| 넥스트랩 | 272 | 129 | 라벨·안내문·에러 문구·주석 |
| 진흥원 | 164 | 98 | |
| 재기지원 | 32 | 19 | |
| 대전 | 18 | 10 | **1건은 오탐**(`application-form.tsx:64` "휴대전화") → 실제 17줄 |
| restart.poclab.kr | 6 | 3 | SMS·이메일 본문 URL 하드코딩 (`application-actions.ts` `application.ts` `case-lifecycle.ts`) |
| OP.map | 4 | 4 | 이메일 제목 접두 |
| 경영개선 / 폐업 | 33 / 56 | 18 / 23 | 지원유형 문구 — `support_type_code` 교체 시 함께 정리 |

CLAUDE.md §8 의 명령(`grep -rn "재기지원\|진흥원\|넥스트랩\|대전\|restart.poclab.kr" src/`) 기준 **391줄**.

### 4-2. 디렉터리별 (같은 5개 용어)
| 경로 | 줄 수 |
|---|---|
| `src/components` | 173 |
| `src/lib` | 155 |
| `src/app` | 57 |
| `src/types` | 6 (`case-status.ts` 라벨) |
| `public/sw.js` | 1 (파일 머리 주석) |
| `supabase/migrations` | 110 (주석 + 0037 주간 안내문 시드 `'[재기지원사업] {mentor}멘토님…'`) |
| `docs/` | 87 (설계 문서 — 치환 대상 아님) |

### 4-3. 집중 파일 (상위)
| 파일 | 줄 수 | 성격 |
|---|---|---|
| `components/institution/institution-guide-content.tsx` | 17 | 사용 안내 본문 → 전면 재작성 |
| `lib/workflow/case-actions.ts` | 13 | 에러·이력 문구 |
| `lib/workflow/application.ts` | 11 | 알림 문구 + URL |
| `lib/workflow/application-actions.ts` | 10 | 알림 문구 + URL |
| `components/nextlab/view-as-dashboard.tsx` / `components/mentor/mentor-guide-content.tsx` | 8 / 8 | |
| `app/(auth)/privacy-policy/page.tsx` / `login/page.tsx` / `terms/page.tsx` | 8 / 7 / 3 | 기관명·로고 alt |
| `app/layout.tsx` / `app/manifest.ts` | 2 / 2 | `<title>`·PWA 이름 |
| `lib/documents/templates.ts:14` | 1 | `INSTITUTION = '대전일자리경제진흥원장'` (서식 직인란) |
| `components/cases/mentoring-log-document.tsx:5`, `lib/workflow/consulting-report.ts:25` | 1 / 1 | 보고서 제목 상수 |

### 4-4. DB 쪽 잔재
- `app_settings.mentor_weekly_reminder_template` — 0037 시드 문구. START-HERE 에 따르면 새 DB 에는 **중립 문구로 대체 + `mentor_weekly_reminder_enabled='false'`** 로 적용됨(코드 기본값은 `'true'`).
- `support_types` 시드(0004) 미적용 → 현재 DB 에 지원유형 0건. `createCase` 는 `supportTypeCode: 'management_improvement'|'closure'` 타입을 요구하므로 **사업그룹 시드 전에는 케이스 등록 불가**.

---

## 5. 조사 중 발견한 문서·코드 불일치 (개조 전 알아둘 것)
1. **부트스트랩 토큰 이름** — CLAUDE.md §9·START-HERE §4 는 `SETUP_TOKEN`, 코드(`src/app/api/setup/route.ts:18`)와 HANDOVER 는 `BOOTSTRAP_TOKEN`. Vercel 환경변수는 **`BOOTSTRAP_TOKEN`** 으로 넣어야 한다.
2. `mentor-tasks.ts:52` 주석 `// 7` 이지만 `CASE_STATUS_META.approved.step` 은 **8**. 동작엔 영향 없음(상수 참조).
3. #6·#7 전이의 이력 `from_status` 가 `'contacted'` 로 고정되어 `mentor_assigned` 에서 바로 일지를 쓰면 이력이 실제와 다르게 남는다.
4. 알림 템플릿(`notifications/templates.ts`)에 `execution_docs_submitted`·`payment_application_drafted` 가 없어 GENERIC 문구("알림이 있습니다.")로 나간다.
5. `support_type_documents` 는 안내 표시에만 쓰이고 업로드 검증과 연결돼 있지 않다(§3-2 마지막 행).

---

## 6. 이 조사로 확정 가능해진 것 / 아직 사용자 답이 필요한 것
- 확정 가능: 역할 개조 범위(§1), 회차 카운트 방식(§2-4), `mentoring_report` 재사용(§3-2).
- 답이 필요: `docs/START-HERE.md` §3 의 6개 질문 — 승인 게이트 유무, 평가서 단일본/회차별, 컨설팅 유형·단가·그룹별 차등, 정산 주기, 정산 인정 기준, 사업그룹 이름·승계 관계.
