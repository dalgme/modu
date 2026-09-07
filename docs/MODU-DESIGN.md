# 모두의창업 플랫폼 설계 v1 — 상태머신 · 서류 · 정산 · 다중 행사(프로그램) 구조

> 작성일: 2026-09-07 · 기준 코드: `dalgme/modu` `b387ef2` (restart 원본, 개조 전)
> 근거: `docs/CURRENT-STATE.md`(현행 코드 조사) + 사용자 답변 6건(2026-09-07) + "계정 추가로 여러 행사에 복제" 요건.
> 이 문서는 **구현 착수 전 설계 확정본**이다. 결정이 바뀌면 §12 결정 기록에 날짜와 함께 추가한다.

---

## 0. 사용자 답변 → 설계 반영 요약

| # | 질문 | 답변 요지 | 설계 반영 위치 |
|---|---|---|---|
| 1 | 승인 게이트 | 멘토: 기초정보(날짜·시간·장소·온/오프) → 보고서 웹작성/업로드 → 종료 시 **관찰의견서** 작성 + 종결 클릭 → **렛츠 검수 + 정산정보 상신** → **센터 확인 + 정산 클릭** → 종결 확정. 멘티: **서명 / 만족도조사 / 멘토 변경 요청** | §3 상태머신, §7 멘티 기능 |
| 2 | 평가서 | = 관찰의견서. 멘티당 **1건**, 담당 멘토가 컨설팅 마무리 후 작성 → 운영기관에 종결 요청 | §5 `observation_report` 단일본 |
| 3 | 유형·단가 | 온라인 8만/회, 오프라인 10만/회. **1일 1건(멘티)당** 온라인 최대 24만·오프라인 최대 30만. 멘토 1인 **1일 최대 3건(멘티)**. 사유 있으면 멘토 요청으로 특정 멘티 **1회 추가** | §4 회차 검증, §6 단가 테이블 |
| 4 | 정산 주기 | 미정. 멘토가 지정 회차(3~4회) 종료 + 종결 요청 → 정산정보(유형별 회차·단가·합계·원천징수·실지급요청액) 생성 → 렛츠 검토·승인 → **지급(종결) 대기** → 선택적으로 모아 **지급 품의** | §6 정산, §3 상태 `settlement_pending`→`settlement_batched` |
| 5 | 인정 기준 | 보고서 등록(날짜·시간·장소·유형·내용·사진) = **회차 이행**(예상 비용, 변경 가능). 관찰의견서 제출 + 렛츠 승인 = **회차 완료 = 정산 집계 확정** | §6-3 예상/확정 이원화 |
| 6 | 사업그룹 | A 1기/2라운드 · B 2기/1라운드 · C 2기/2라운드 · D 2기/탈락자. 추가 생성 가능. 그룹 간 멘티·멘토 승계, 데이터는 독립이되 이력 열람 가능 | §2 그룹 = `support_types` 동적화, §8 승계 |
| + | 복제 | 이 운영방식을 **계정 추가로 복제/생성**해 여러 행사에 사용 | §1 프로그램(행사) 계층 |

---

## 1. 다중 행사(프로그램) 구조 — "계정 추가로 복제"

### 1-1. 선택지와 결정
| 방식 | 내용 | 판단 |
|---|---|---|
| A. 행사마다 인프라 복제 | GitHub·Vercel·Supabase 3종을 매번 새로 만든다 (`PLATFORM-CLONE-HANDOVER.md`) | 지금 modu 가 이 방식으로 만들어짐. 행사가 늘 때마다 45개 마이그레이션·환경변수 27개·도메인을 반복 → **운영 부담 큼** |
| **B. 한 배포 안의 프로그램 계층 (채택)** | `programs` 테이블을 최상위에 두고 **계정·그룹·케이스·단가·브랜딩이 프로그램에 소속**. 플랫폼 관리자가 화면에서 "새 행사 개설 → 첫 계정 발급"만 하면 새 행사가 열린다 | 사용자 요건에 정확히 부합. 데이터 격리는 RLS + 앱 스코프 이중으로 |

A 방식 문서는 **재해복구·완전 분리가 필요한 고객용 대안**으로 유지한다.

### 1-2. 계층
```
platform (플랫폼 관리자 — 렛츠 본사 계정, program_id = null)
 └ programs (행사·사업: 모두의창업 2026, ○○ 액셀러레이팅 2027 …)
     ├ users (institution · nextlab · mentor · mentee — 전부 program_id 보유)
     ├ support_types (= 사업그룹 A·B·C·D … 동적 생성)
     │    └ cases (멘티 1명 = 1건) ─ mentor_assignments ─ mentoring_logs ─ documents …
     ├ consulting_rates (유형별 단가·일일 상한, 이력)
     ├ settlement_batches (지급 품의)
     └ program 설정 (브랜딩 라벨 · 원천징수율 · 멘토 1일 상한 · 문자 꼬리말 …)
```

### 1-3. 원칙
1. **1계정 = 1프로그램.** 한 사람이 두 행사를 맡으면 계정을 두 개 발급한다("계정 추가로 복제"의 문자 그대로). 멤버십 다대다 테이블은 만들지 않는다 — 대행(view-as)·감사·RLS 헬퍼가 전부 `auth.uid()` 단일 신원을 전제로 하기 때문.
2. **프로그램 격리는 두 겹.** (a) RLS 헬퍼 `private.program_id()` 를 스태프 정책에 결합, (b) 서비스롤 경로의 모든 스태프 조회·알림 수신자 조회에 `program_id` 필터를 코드로 강제(`CURRENT-STATE.md §1-4` 의 `.eq('role', …)` 지점 전부).
3. **브랜딩·문구는 프로그램 설정에서 읽는다.** `ROLE_LABELS` 의 "진흥원/넥스트랩" 하드코딩을 `programs.client_label / operator_label` 로 치환. 원본 문자열 391줄 치환의 종착점.
4. **플랫폼 관리자는 역할 enum 을 늘리지 않고 `users.is_platform_admin` 플래그**로 둔다. 라우트 `/platform/*` 은 이 플래그로만 열린다. (enum 추가 시 53개 파일 영향 — `CURRENT-STATE.md §1`)
5. 스토리지 경로는 `{caseId}/…` 로 이미 전역 유일 → 변경 없음. Cron 은 프로그램을 순회한다.

### 1-4. 새 행사 개설 흐름 (플랫폼 관리자 화면 `/platform/programs/new`)
```
① 행사 정보     : 이름·슬러그·발주기관명(라벨)·운영기관명(라벨)·앱 타이틀·로고·문자 꼬리말
② 운영 규칙     : 원천징수율(기본 3.3%) · 멘토 1일 최대 건수(기본 3) · 기본 회차(기본 4)
③ 단가          : 온라인/오프라인 회당 단가 + 1일 상한 (effective_from = 개설일)
④ 사업그룹      : 최소 1개 (이름·코드·회차수) — 나중에 추가 가능
⑤ 첫 계정       : 센터(institution) 1개 + 운영총괄(nextlab) 1개 → 임시비밀번호 발급
⑥ (선택) 복제   : 기존 프로그램의 그룹·단가·서식·FAQ 를 복사
```
`/api/setup` 부트스트랩은 **플랫폼 관리자 1명**만 만든다(현재는 institution 을 만듦 → 변경).

### 1-5. 스키마 변경
```sql
create table programs (
  id uuid pk, slug text unique, name text,
  client_label text,      -- 화면 표기: '세종창조경제혁신센터'
  operator_label text,    -- '(주)렛츠'
  app_title text, logo_path text, sms_footer text,
  withholding_rate numeric(5,2) default 3.3,
  mentor_daily_case_limit int default 3,
  default_required_rounds int default 4,
  is_active bool default true, created_by uuid, created_at, updated_at
);
alter table users add column program_id uuid references programs(id),
                  add column is_platform_admin bool not null default false;
-- 제약: is_platform_admin = false 이면 program_id not null (check)
alter table support_types add column program_id uuid not null references programs(id);
alter table document_templates add column program_id uuid references programs(id); -- null = 공통
alter table app_settings add column program_id uuid; -- pk 를 (program_id, key) 로 교체
create function private.program_id() returns uuid ... select program_id from users where id = auth.uid();
```
RLS: 스태프 정책(`is_staff()`)에 `support_types.program_id = private.program_id()` 조인 조건 추가. 멘토·멘티는 이미 케이스 배정 기준이라 추가 조건 불필요(배정 자체가 프로그램 안에서만 일어남).

---

## 2. 역할 · 사업그룹

### 2-1. 역할 (enum 유지)
| 키 | 라벨 (프로그램 설정) | 모두의창업 기본값 | 하는 일 |
|---|---|---|---|
| `institution` | `client_label` | 세종창조경제혁신센터 | 진행현황·정산 열람, **정산 확인(종결 확정)** |
| `nextlab` | `operator_label` | (주)렛츠 | 그룹 개설, 멘티·멘토 등록, 배정·변경, **종결 검수·정산 승인·지급 품의** |
| `mentor` | 멘토 | | 회차 등록(웹/업로드), 관찰의견서, 종결 요청, 추가 회차 요청 |
| `mentee` | 멘티 | | 진행 열람, **회차 서명**, **만족도 조사**, **멘토 변경 요청**, 그룹 필수서류 업로드 |

라우트 그룹 폴더 `(nextlab)` 과 URL `/nextlab` 은 **`/operator` 로 개명**한다(라벨은 설정값이므로 URL 만 중립화). 역할 키 `nextlab` 은 유지.

### 2-2. 사업그룹 = `support_types` 동적화
`support_type_code` enum(경영개선/폐업정리 고정)은 그룹이 "더 생성될 수 있음" 요건과 맞지 않는다.
```sql
alter table support_types alter column code type text;          -- enum → text
drop type support_type_code;
alter table support_types
  drop constraint support_types_code_key,
  add unique (program_id, code),
  alter column limit_amount drop not null, alter column calc_method drop not null,  -- 금액지원 개념 없음
  add column required_rounds int not null default 4,               -- 그룹별 회차(3~4)
  add column round_label text default '컨설팅',
  add column predecessor_support_type_id uuid references support_types(id), -- 승계 원천 그룹
  add column starts_on date, add column ends_on date, add column is_active bool default true;
```
모두의창업 시드(0004 대체): `A: modu-1-2 (1기/2라운드)`, `B: modu-2-1`, `C: modu-2-2`, `D: modu-2-drop (2기/탈락자)`, `required_rounds` 는 그룹별 입력(3 또는 4 — 시드는 4, 화면에서 수정).

`support_type_documents` 는 **그룹별 필수서류**로 살린다(§5-3).

---

## 3. 진행 단계(상태머신 v2)

### 3-1. 상태 (enum 전면 교체 — 새 DB 이므로 타입 재생성)
| 순서 | status | 라벨 | 톤 | 진입 조건 |
|---|---|---|---|---|
| 1 | `registered` | 멘티 등록 | pending | 케이스 생성 |
| 2 | `mentor_assigned` | 멘토 배정 | progress | 활성 배정 생성 |
| 3 | `in_progress` | 컨설팅 진행 중 | progress | 1회차 등록 시 자동 (n/N 회차는 배지로 표시) |
| 4 | `closure_requested` | 종결 요청(관찰의견서 제출) | progress | 필수 회차 충족 + 관찰의견서 존재 + 멘토 '종결' 클릭 |
| 4' | `revision_requested` | 보완 요청 | rejected | 렛츠 검수 반려 → 멘토 수정 후 재요청 |
| 5 | `settlement_pending` | 검수 완료 · 지급 대기 | approved | 렛츠 검수 승인 + 정산 확정 저장 |
| 6 | `settlement_batched` | 지급 품의 편성 | progress | 렛츠가 품의 묶음에 포함 |
| 7 | `closed` | 종결 확정 | approved | 센터 담당자 '정산 확인' 클릭 |
| 0 | `withdrawn` | 중도 종료 | rejected | 스태프 종료 처리(사유) |

`contacted`(멘티 연락) 단계는 답변에 없어 제거한다. 필요하면 회차 0 의 "연락 기록" 메모로 대체.

### 3-2. 전이 표 (버튼 조건과 서버 게이트를 **같은 상수**에서 읽는다 → `src/lib/workflow/transitions.ts`)
| # | from → to | 주체 | 액션 | 게이트 (DB 조건부 update) | 부수효과 |
|---|---|---|---|---|---|
| T1 | ∅ → `registered` | nextlab (institution 도 허용 여부는 설정) | `createCase` | — | 멘티 계정 자동 발급(휴대폰 임시비번), `predecessor_case_id` 있으면 승계 링크 |
| T2 | `registered` → `mentor_assigned` | nextlab | `assignMentor` | `= registered` | 알림 멘토+멘티 |
| T3 | 상태 유지 · 멘토 교체 | nextlab | `reassignMentor` | ∉ {registered, closed, withdrawn} | `is_active` 교체, 회차는 케이스 누적 유지 |
| T4 | `mentor_assigned` → `in_progress` | mentor | `submitRound` (1회차) | `= mentor_assigned` | 회차 검증(§4-3) |
| T5 | `in_progress`/`revision_requested` → `closure_requested` | mentor | `requestClosure` | `∈ {in_progress, revision_requested}` ∧ 회차 ≥ required_rounds ∧ `observation_report` 존재 ∧ (설정) 전 회차 멘티 서명 완료 | 정산 **예상본** 생성·첨부, 알림 nextlab |
| T6 | `closure_requested` → `revision_requested` | nextlab | `reviewClosure(revision)` | `= closure_requested` | `reviews` 기록, 알림 멘토 |
| T7 | `closure_requested` → `settlement_pending` | nextlab | `reviewClosure(approve)` | `= closure_requested` | `reviews` 기록, **`settlements` 확정 스냅샷 저장**(§6), 알림 멘토(정산 통보) + 센터 |
| T8 | `settlement_pending` → `settlement_batched` | nextlab | `addToBatch` | `= settlement_pending` | `settlements.batch_id` 세팅 |
| T8' | `settlement_batched` → `settlement_pending` | nextlab | `removeFromBatch` | batch 가 draft 일 때만 | |
| T9 | `settlement_batched` → `closed` | **institution** | `confirmSettlement` (품의 단위 일괄 또는 건별) | `= settlement_batched` | 알림 멘토·멘티, 만족도조사 미제출이면 멘티 안내 |
| T10 | 비종결 → `withdrawn` | staff | `withdrawCase` | `∉ {closed, withdrawn}` | 배정 해제, 이미 이행한 회차의 정산 처리 여부는 §6-6 |

UI 노출 규칙: 진행바(`CASE_STEP_ORDER`) = 1·2·3·4·5·6·7. `revision_requested` 는 4 단계에 반려 톤으로, `withdrawn` 은 0.

### 3-3. 원본 대비 제거되는 것
`contacted` `log_completed` `contractor_registered` `application_drafted` `under_review` `reviewed` `approved` `rejected` `notified` `execution_docs_submitted` `payment_application_drafted` `payment_approved` 와 관련 전이 #5, #7~#20(`CURRENT-STATE.md §2-2`), 패널 `ReviewPanel`·`ApprovalPanel`·`PaymentApprovalPanel`·지급신청 카드·사전/사후 지원신청 화면 전부.

---

## 4. 회차(컨설팅) 모델 — `mentoring_logs` v2

### 4-1. 1 회차 = `mentoring_logs` 1행 (웹작성이든 업로드든)
```sql
alter table mentoring_logs
  add column round_no int not null,                 -- 케이스 내 회차 번호(1..N), unique (case_id, round_no)
  add column mode consulting_mode not null,         -- enum: online | offline
  add column started_at timestamptz not null,       -- 날짜+시작시간 (visited_at 대체)
  add column ended_at timestamptz not null,
  add column place text,                            -- 오프라인 장소 / 온라인 도구
  add column report_kind text not null,             -- 'web' | 'file'
  add column content text null,                     -- web 이면 필수 (기존 not null 완화)
  add column unit_price_snapshot numeric(14,2) not null,  -- 등록 시점 단가 (소급 변조 방지)
  add column amount_snapshot numeric(14,2) not null,      -- 이 회차 인정액 (상한 반영 후)
  add column rate_id uuid references consulting_rates(id),
  add column mentee_signed_at timestamptz,          -- 멘티 서명 시각
  add column is_extra bool not null default false;  -- 추가 회차(승인된 요청) 여부
```
- `mentor_id` 는 유지 → "몇 회차를 누가 했는지" 추적(멘토 변경 승계).
- 사진: `documents.doc_key = mentoring_photo:{logId}` (기존 규약 유지).
- 업로드 보고서: `documents.doc_key = mentoring_report:{logId}` (회차 태깅으로 변경 — 원본은 무태깅 누적).
- 회차 수 = `count(mentoring_logs where case_id)` **케이스 단위** (멘토 변경 시 리셋 없음, CLAUDE.md §6-9).

### 4-2. "회차 이행" vs "회차 완료"
| 상태 | 판정 | 정산 취급 |
|---|---|---|
| 이행 (performed) | 행이 존재하고 필수 필드(일시·장소·유형·내용 또는 파일·사진 ≥1) 충족 | **예상 비용** — 렛츠 대시보드에 "미확정" 표시 |
| 완료 (completed) | 케이스가 `settlement_pending` 이상 (관찰의견서 승인) | **확정** — `settlements` 스냅샷에 포함 |
회차 행에 별도 status 컬럼을 두지 않고 **케이스 상태에서 파생**한다(이중 상태 방지).

### 4-3. 등록 시 검증 (서버 액션 `submitRound` — 전부 코드에서 직접 검사)
1. 담당 멘토(활성 배정) 확인 — `mentorOfCaseOrNull`.
2. 케이스 상태 ∈ {`mentor_assigned`, `in_progress`, `revision_requested`}.
3. **회차 상한**: `count + 1 ≤ required_rounds + 승인된 추가 회차 합`.
4. **1일 1건 상한**: 같은 `case_id` · 같은 날짜(KST) · 같은 `mode` 의 `amount_snapshot` 합 + 이번 단가 ≤ `daily_cap_amount` (온라인 24만 = 3회, 오프라인 30만 = 3회). 초과 시 거부(메시지에 남은 한도 표시).
5. **멘토 1일 3건**: 같은 `mentor_id` · 같은 날짜의 **distinct case_id** 수가 이미 `mentor_daily_case_limit` 이고 이번 케이스가 그 안에 없으면 거부.
6. 시간 겹침: 같은 멘토의 다른 회차와 `[started_at, ended_at)` 이 겹치면 거부.
7. 단가 스냅샷: `consulting_rates` 에서 `(program, support_type ?? null, mode, effective_from ≤ started_at::date)` 최신 1건. 없으면 거부("단가 미설정").

### 4-4. 추가 회차 요청
```sql
create table round_extension_requests (
  id uuid pk, case_id uuid, requested_by uuid (mentor), reason text not null,
  extra_rounds int not null default 1,
  status text check in ('pending','approved','rejected') default 'pending',
  decided_by uuid, decided_at timestamptz, decision_note text, created_at
);
```
멘토 화면 "회차 추가 요청" → 렛츠 요청함에서 승인/반려 → 승인분만 §4-3-3 상한에 합산. 승인된 추가 회차는 `is_extra = true` 로 등록되어 정산 내역에 별도 줄로 표시.

---

## 5. 서류 체계 v2 (`doc_key`)

### 5-1. 카탈로그
| doc_key | 이름 | 성격 | 강제 | 생성 주체 |
|---|---|---|---|---|
| `mentoring_report:{logId}` | 회차 보고서(업로드본) | 누적(회차당 1) | 유니크 인덱스 `(case_id, doc_key)` 로 회차당 1건 | mentor |
| `mentoring_photo:{logId}` | 회차 사진 | 누적 | 없음 | mentor |
| `observation_report` | **관찰의견서**(웹 작성 PDF 또는 업로드) | **단일본** | **DB 유니크 인덱스**(0045 대체 마이그레이션) + 앱 delete-then-insert | mentor |
| `settlement_statement` | 정산서(확정 시 생성 PDF) | 이력보존(확정마다 1건, 열람은 최신) | 없음(의도) | 시스템(T7) |
| `satisfaction_survey_pdf` | 만족도조사 결과 PDF (선택) | 단일본 | 유니크 인덱스 | 시스템 |
| `req:{support_type_documents.doc_key}` | 그룹별 필수서류(사업계획서·참가확인서 등) | 그룹 설정의 `is_required`/`multiple` 에 따름 | multiple=false 면 유니크 인덱스 대상 접두 `req1:` 로 구분 | mentee / nextlab 대리 |
| `application_pdf` | 등록 원본(신청서·명단 등) | 이력보존 | 없음 | nextlab |

유니크 인덱스(새 마이그레이션, 0045 대체):
```sql
drop index if exists documents_singleton_doc_key_idx;
create unique index documents_singleton_doc_key_idx on documents (case_id, doc_key)
  where doc_key in ('observation_report','satisfaction_survey_pdf')
     or starts_with(doc_key, 'mentoring_report:')
     or starts_with(doc_key, 'req1:');
```

### 5-2. 제거되는 키
`consulting_report` `support_application(_file)` `form_*` `applicant_biz_reg` `business_plan_attachment` `contractor_*` `si:*` `post:*` `payment_*` `pledge_no_overlap_file` 및 관련 액션·컴포넌트(`CURRENT-STATE.md §3-2` 의 "제거" 행 전부). `contractors`·`support_applications`·`payment_applications`·`approvals` 테이블은 **삭제 마이그레이션**으로 정리(빈 DB 라 안전). `reviews` 는 종결 검수 기록으로 **재사용**.

### 5-3. 그룹별 필수서류 배선
`support_type_documents` 를 안내 표시 전용에서 **멘티 업로드 슬롯**으로 연결: 멘티 케이스 화면에 그룹의 문서 목록을 `CaseDocUpload` 슬롯으로 렌더(라벨 = `doc_name`, 키 = `req:`+`doc_key`). 종결 요청 게이트에 "필수서류 누락 없음" 조건을 **옵션**(프로그램 설정)으로 둔다.

### 5-4. 관찰의견서 서식
`document_templates.template_key = 'observation_report'` (프로그램별 override 가능). 웹 작성 폼 → HTML → PDF(기존 `render.ts`), 멘토 서명 삽입. 업로드 경로도 허용(단일본 교체).

---

## 6. 정산

### 6-1. 단가 테이블
```sql
create type consulting_mode as enum ('online','offline');
create table consulting_rates (
  id uuid pk, program_id uuid not null, support_type_id uuid null,  -- null = 프로그램 기본
  mode consulting_mode not null,
  unit_price numeric(14,2) not null,        -- 온라인 80,000 / 오프라인 100,000
  daily_cap_amount numeric(14,2) not null,  -- 온라인 240,000 / 오프라인 300,000 (1일 1건당)
  effective_from date not null, created_by uuid, created_at,
  unique (program_id, support_type_id, mode, effective_from)
);
```
단가 변경은 **행 추가**(effective_from)로만 한다. 과거 회차는 `unit_price_snapshot` 을 갖고 있어 흔들리지 않는다.

### 6-2. 계산 함수 — **한 곳** `src/lib/settlement/compute.ts` (순수 함수, 단위 테스트 필수)
```ts
computeSettlement(input: {
  rounds: { mode, unit_price_snapshot, amount_snapshot, is_extra, started_at }[],
  withholdingRate: number,          // 3.3 (프로그램 설정)
}): {
  lines: { mode, count, unit_price, amount }[],   // 유형별 내역 (+ 추가회차 줄)
  gross: number,                                  // 합계
  withholding: number,                            // 원천징수액 = round(gross × rate/100)  ← 절사 규칙 확정 필요
  net: number,                                    // 실지급요청액 = gross − withholding
}
```
- 화면의 "예상 비용"(§4-2)과 T7 의 확정 저장이 **같은 함수**를 호출한다.
- 원천징수: 프리랜서 사업소득 3.3%(소득세 3% + 지방소득세 0.3%) 기본값. 10원 미만 절사 등 반올림 규칙은 §11 확인 항목.
- 테스트 러너: 리포에 없음 → `vitest` 추가(`npm run test` 를 검증 3종에 4번째로 편입).

### 6-3. 예상 vs 확정
| 구분 | 원천 | 노출 | 저장 |
|---|---|---|---|
| 예상 | `mentoring_logs` 실시간 집계 | 렛츠 대시보드·멘토 화면 "예상 정산액(미확정)" 배지 | 저장 안 함 |
| 확정 | T7 시점 `computeSettlement` 결과 | 렛츠·센터·멘토 | `settlements` 1행 + `settlement_statement` PDF |

```sql
create table settlements (
  id uuid pk, case_id uuid not null unique, program_id uuid not null,
  mentor_id uuid not null,                      -- 확정 시점 담당 멘토(지급 대상)
  lines jsonb not null, gross numeric, withholding_rate numeric, withholding numeric, net numeric,
  rounds_snapshot jsonb not null,               -- 회차 id·일시·유형·단가 목록 (감사용)
  confirmed_by uuid, confirmed_at timestamptz,
  batch_id uuid references settlement_batches(id),
  paid_at timestamptz, created_at
);
```
확정 후 회차가 추가·수정되면(원칙적으로 `settlement_pending` 이후 회차 편집은 잠금) 다음 정산이 아니라 **재확정 없이 잠금**이 기본. 예외 편집은 렛츠의 "확정 취소(T7 역전이, 사유 필수)" 로만 — 감사로그 필수.

> ⚠ 멘토 변경이 있었던 케이스: 정산은 **회차별 `mentor_id`** 로 나뉜다. `settlements.lines` 에 멘토별 소계를 넣고, 지급 대상이 둘 이상이면 품의 화면에 멘토별 행으로 펼친다.

### 6-4. 지급 품의 (`settlement_batches`)
```sql
create table settlement_batches (
  id uuid pk, program_id uuid not null, title text not null,   -- '2026-10 1차 지급 품의'
  status text check in ('draft','submitted','confirmed','paid') default 'draft',
  created_by uuid, submitted_at, confirmed_by uuid (institution), confirmed_at, paid_at,
  total_gross numeric, total_withholding numeric, total_net numeric, created_at
);
```
렛츠: `settlement_pending` 케이스를 체크박스로 골라 품의 생성(draft) → 제출(submitted, T8) → 센터: 품의 상세에서 **"정산 확인"**(confirmed → 포함 케이스 전부 T9 `closed`) → 렛츠: 실제 지급 후 `paid` 표시. 품의서 PDF/엑셀 내보내기 제공.

### 6-5. 통보
T7 확정 시 멘토에게 인앱 + 문자(`queueNotification`, 기존 큐·Cron 재사용): "○○ 멘티 정산 확정 — 온라인 N회·오프라인 M회, 합계 X원, 원천징수 Y원, 실지급 Z원". 문자는 try/catch 격리(CLAUDE.md §6-5).

### 6-6. 중도 종료(`withdrawn`) 시 이행 회차
이미 이행한 회차는 정산 대상인지 **정책 확정 필요**(§11). 기본안: 렛츠가 종료 처리 시 "이행분 정산" 체크박스 → 체크 시 T7 과 같은 확정 스냅샷을 만들고 `settlement_pending` 대신 `withdrawn` 상태로 두되 `settlements` 행은 생성.

---

## 7. 멘티 기능

| 기능 | 데이터 | 흐름 | 게이트 |
|---|---|---|---|
| **회차 서명** | `signatures(signer_type=mentee, document_type='mentoring_log', log_id)` + `mentoring_logs.mentee_signed_at` | 멘티 대시보드 "서명 대기 회차" → 캔버스 서명 | 프로그램 설정 `require_mentee_signature_for_closure`(기본 true)면 T5 게이트 |
| **만족도 조사** | `satisfaction_surveys(case_id unique, mentee_id, answers jsonb, score int, comment, submitted_at)` + 문항은 `program_survey_questions` (프로그램별 편집) | `closure_requested` 부터 노출, 1회 제출 | T9 게이트로 두지 않음(멘티 미응답이 정산을 막으면 안 됨) — 미제출 시 리마인더 문자 |
| **멘토 변경 요청** | `mentor_change_requests(case_id, requested_by, reason, status pending/accepted/rejected, handled_by, note)` | 멘티 → 렛츠 요청함 → 수락 시 T3 `reassignMentor` 호출 | 진행 중 상태에서만 |
| 진행 열람 | 기존 `mentee-journey` 재사용 (7단계) | | |
| 필수서류 업로드 | §5-3 | | |

기존 멘티 화면 중 `pre-support` `post-support` `contractor-signatures` `support-scope` 는 제거.

---

## 8. 그룹 간 승계

- `cases.predecessor_case_id uuid references cases(id)` (CLAUDE.md §2-2 그대로).
- 운영 화면 "승계 개설": 원천 그룹 선택 → 케이스 다중 선택 → 대상 그룹 선택 → 옵션 **[같은 멘토 유지]** → 일괄 생성(T1). 멘티 계정은 재발급하지 않고 `mentee_id` 그대로 연결(같은 프로그램 안이므로 가능). 다른 **프로그램**으로의 승계는 계정이 프로그램에 묶여 있으므로 지원하지 않는다(필요 시 CSV 내보내기/가져오기).
- 상세 화면 "이전 단계 이력" 탭: `predecessor_case_id` 체인을 따라 회차·서류·정산을 **읽기 전용**으로 표시. 데이터 자체는 복사하지 않는다(그룹별 독립).
- 멘토 승계: 대상 그룹에서 `assignMentor` 시 원천 케이스의 활성 멘토를 기본 선택값으로 제안.

---

## 9. 알림 이벤트 (`notifications/templates.ts` 전면 교체)
| trigger_event | 수신 | 채널 |
|---|---|---|
| `mentor_assigned` | 멘토·멘티 | 인앱 + 문자 |
| `round_registered` | 멘티(서명 요청) | 인앱 + 문자 |
| `round_signed` | 멘토 | 인앱 |
| `extension_requested` / `extension_decided` | 렛츠 / 멘토 | 인앱 |
| `mentor_change_requested` / `mentor_change_decided` | 렛츠 / 멘티 | 인앱 + 문자 |
| `closure_requested` | 렛츠 | 인앱 + 문자 + 이메일 |
| `revision_requested` | 멘토 | 인앱 + 문자 |
| `settlement_confirmed` | 멘토(+센터) | 인앱 + 문자 |
| `batch_submitted` | 센터 | 인앱 + 이메일 |
| `case_closed` | 멘토·멘티 | 인앱 |
| `survey_reminder` | 멘티 | 문자 (Cron) |
| `closure_overdue` | 렛츠 (요청 후 N일 미검수) | 인앱 (Cron, 기존 overdue 재사용) |
문자 본문의 URL 은 `NEXT_PUBLIC_APP_URL`, 꼬리말은 `programs.sms_footer` — 하드코딩 금지.

---

## 10. 마이그레이션 · 코드 변경 지도

### 10-1. 새 마이그레이션 (0046~; 0004·서식 21종은 계속 건너뜀)
| 번호 | 내용 |
|---|---|
| 0046 | `programs` + `users.program_id / is_platform_admin` + `private.program_id()` + 스태프 RLS 보강 |
| 0047 | `support_types` 동적화(enum→text, program_id, required_rounds, predecessor) + `support_type_documents.multiple` |
| 0048 | `case_status` v2 재생성(`cases`, `case_status_history` 컬럼 재타입) |
| 0049 | `consulting_mode` enum + `consulting_rates` + `mentoring_logs` v2 컬럼 |
| 0050 | `settlements` + `settlement_batches` |
| 0051 | `round_extension_requests` + `mentor_change_requests` + `satisfaction_surveys` + `program_survey_questions` + `cases.predecessor_case_id` |
| 0052 | `documents` 단일본 인덱스 v2 (0045 교체) |
| 0053 | 레거시 테이블 삭제: `contractors` `support_applications` `payment_applications` `approvals` + 관련 정책 |
| 0054 | 시드: 프로그램 `modu-2026` + 그룹 A·B·C·D + 단가(온 8만/24만, 오프 10만/30만) + 알림 템플릿 + 관찰의견서 서식 자리 |

### 10-2. 코드 — 삭제
`src/lib/workflow/{application*,attachment-forms*,payment*,support-items-actions,contractor,consulting-report*,supplement-actions,edit-grant-actions,case-editor}.ts`, `src/lib/support/`, `src/lib/data/{contractor-config,support-items,payment-files,application-files,application-bundle,mentee-progress}.ts`, 멘토 `apply/contractor-docs/contractor-signatures/pre-support/post-support/support-scope` 라우트, 멘티 `pre-support/post-support/contractor-signatures/support-scope` 라우트, 컴포넌트 `application-form, payment-*, contractor-*, attachment-forms-panel, edit-grant-*, case-deliverables-review(개편)`, API `institution/cases/parse-application·application-docs`.

### 10-3. 코드 — 수정
| 파일 | 변경 |
|---|---|
| `src/types/case-status.ts` | v2 상태·라벨·순서 |
| `src/lib/workflow/transitions.ts` (신규) | 전이 상수: `{from[], to, roles[]}` — UI `canTransition()` 과 액션 게이트가 공용 |
| `src/lib/auth/roles.ts` | `ROLE_LABELS` → `roleLabel(role, program)` |
| `src/lib/auth/guards.ts` | `requirePlatformAdmin()`, 프로필에 `program_id` 포함 |
| `src/lib/workflow/cases.ts` | `supportTypeCode` 타입 제거, `predecessor_case_id`, 프로그램 스코프 |
| `src/lib/workflow/mentoring.ts` → `rounds.ts` | v2 검증(§4-3), 스냅샷 |
| `src/lib/workflow/mentor-tasks.ts` | `logRequirement` → `support_types.required_rounds + 승인 추가분` |
| `src/lib/data/mentor-workflow.ts` | 5단계 → 회차 / 관찰의견서 / 종결 요청 3단계 |
| `src/lib/notifications/*` | 템플릿·수신자 조회에 `program_id` |
| `src/app/(nextlab)` → `(operator)` | 대시보드·케이스 상세·요청함·정산·품의 |
| `src/app/(institution)` | 진행현황·품의 확인·정산 확인 버튼 |
| `src/app/(mentee)` | 서명·만족도·멘토변경·필수서류 |
| `src/app/api/setup/route.ts` | 플랫폼 관리자 생성 |
| `src/app/layout.tsx` `manifest.ts` `login/page.tsx` `privacy-policy` `terms` | 브랜딩 → 프로그램 설정/플랫폼 기본값 |

### 10-4. 코드 — 신규
`src/lib/settlement/{compute.ts, compute.test.ts, actions.ts, batches.ts}`, `src/lib/programs/{data.ts, actions.ts, branding.ts}`, `src/app/(platform)/platform/{programs, programs/new, programs/[id]}`, `src/lib/workflow/{closure-actions, extension-actions, mentor-change-actions, survey-actions}.ts`, `src/components/{settlement, programs, rounds, observation}`.

---

## 11. 확정 필요(설계는 아래 기본값으로 진행하되, 다르면 알려 주세요)
1. **원천징수율 3.3%**, 원 단위 절사 규칙(기본: 원천징수액 원 미만 절사).
2. **1일 상한 해석**: "1일 1건당 24만/30만" 을 **같은 멘티·같은 날·같은 유형 합산 상한**으로 구현(= 3회). 온·오프 혼합 시 각자 상한.
3. **추가 회차 승인 주체**: 렛츠(기본). 센터 승인이 필요하면 2단계로.
4. **종결 요청 게이트에 멘티 서명 필수** 여부(기본 true) · **그룹 필수서류 완료** 여부(기본 false).
5. **만족도 문항**: 프로그램별 편집 가능한 5점 척도 5문항 + 자유의견(기본 시드). 응답 시점 = 종결 요청 이후.
6. **중도 종료 시 이행 회차 정산** 여부(§6-6).
7. **센터의 케이스 등록 권한**: 원본은 institution 이 등록. 모두의창업은 렛츠 등록 기본, 센터는 열람 전용으로 잡음.
8. **그룹별 회차 수**: A~D 각각 3 또는 4 — 시드는 4, 화면에서 수정.
9. **로그인 화면 브랜딩**: 단일 플랫폼 브랜드(기본) vs `/login?p=modu-2026` 로 행사별 로고.

---

## 12. 구현 단계 (검증: `typecheck` · `lint` · `build` · `test` 4종 통과 후 다음 단계)
| 단계 | 내용 | 산출 |
|---|---|---|
| P1 | 마이그레이션 0046~0054 작성 + Supabase `modu` 적용 + `database.ts` 재생성 | 스키마 확정 |
| P2 | 도메인 코어: 상태 v2·전이 상수·역할 라벨·프로그램 스코프·가드 + **레거시 삭제** → 빌드 그린 | 뼈대 |
| P3 | 멘토 흐름: 회차 등록(웹/업로드, 검증 7항목)·사진·관찰의견서·종결 요청·추가 회차 요청 | 멘토 완료 |
| P4 | 정산: `computeSettlement` + 테스트, 예상/확정, 검수 승인(T7), 품의(T8), 센터 확인(T9), 정산서 PDF, 통보 | 정산 완료 |
| P5 | 멘티: 서명·만족도·멘토 변경 요청·필수서류 | 멘티 완료 |
| P6 | 운영: 그룹 관리·승계 개설·이전 이력 탭·요청함(추가회차/멘토변경) | 운영 완료 |
| P7 | 플랫폼: `programs` 콘솔·개설 마법사·복제·`/api/setup` 변경·브랜딩 동적화·문구 391줄 치환 | 다중 행사 |
| P8 | Vercel 생성·환경변수·부트스트랩·역할별 권한 격리 점검·문자 1건·PDF 1건 | 배포 |

---

## 13. 결정 기록
- 2026-09-07 사용자 답변 6건 반영. 승인 게이트 = 렛츠 검수 → 센터 정산 확인 2단계로 확정.
- 2026-09-07 관찰의견서 = 평가서, 멘티당 1건 단일본, DB 유니크 인덱스 대상.
- 2026-09-07 단가 온라인 8만/오프라인 10만, 1일 1건 상한 24만/30만, 멘토 1일 3건, 추가 회차 요청 기능.
- 2026-09-07 정산: 종결 승인 시 확정 스냅샷 → 지급 대기 → 품의 묶음 → 센터 확인 → 종결. 주기는 품의 단위(미정 → 운영 재량).
- 2026-09-07 회차 이행(예상) / 회차 완료(확정) 이원화. 계산 함수 단일화 + 단위 테스트(vitest 도입).
- 2026-09-07 사업그룹 A~D 시드, 그룹 동적 생성(enum → text), 그룹 간 승계 = `predecessor_case_id`.
- 2026-09-07 **다중 행사 = 한 배포 안의 `programs` 계층(B안)**, 1계정 1프로그램, 플랫폼 관리자 플래그. 인프라 복제(A안)는 대안으로 문서 유지.
- 2026-09-07 URL `/nextlab` → `/operator` 개명, 역할 키 `nextlab` 은 유지.
