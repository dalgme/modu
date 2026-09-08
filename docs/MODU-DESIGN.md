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

### 0-2. 2차 답변 (2026-09-07, §11 열린 항목 9건 + 추가 요건 1건)
| # | 답변 | 설계 반영 |
|---|---|---|
| 1 | 원천징수는 **기타소득세 일괄 처리** | §6-2 `withholding_method = other_income` (필요경비율·세율·지방세 파라미터) |
| 2 | **같은 날·같은 멘티** 합산 상한 | §4-3 일일 상한 = 멘티·날짜 기준 합산(회차 수 + 유형별 금액) |
| 3 | 추가 회차 승인 주체 = 렛츠 | §4-4 그대로 |
| 4 | 종결 게이트(멘티 서명 필수·필수서류 완료) **기본 아니오** | §7·§16 설정값 기본 false |
| 5 | 만족도: 문항 추가 가능, **복수선택/주관식/순위 등 유형 선택**, 운영기관 설정에서 **그룹별 표준양식** | §7-2 설문 템플릿·문항·응답 3테이블 |
| 6 | 중도 종료 시에도 이행 회차 정산 · **멘토가 사유 작성** · 잔여 회차는 **타 멘토 배정해 진행·정산** | §3-1 `reassignment_pending`, §6-3 정산 = (케이스 × 멘토) 단위 |
| 7 | 케이스 등록 = 렛츠, 센터 열람 전용 | §3-2 T1 |
| 8 | 그룹별 회차 기본 4회, **설정 페이지에서 조정** | §16 운영 설정 |
| 9 | **로그인 화면은 행사별**, 플랫폼 총괄관리자만 통합 로그인 | §1-6 |
| 10 | (신규) 1일 건수·한도 등 제한 조건이 **행사별/그룹별로 다름 → 설정 페이지** · 멘토/멘티 **다중 키워드 등록 → AI 매칭 추천(근거 기록)** · **멘토별 명단에 지급서류 수령 체크**(비밀번호 재입력, 일괄 입력) | §16 운영 설정 · §14 매칭 추천 · §15 멘토 지급서류 체크 |

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

### 1-3. 원칙 (2026-09-07 3차 답변으로 개정 — **1계정 = 여러 행사·여러 그룹**)
1. **한 계정이 여러 행사(프로그램)·여러 그룹에 귀속될 수 있다.** 멘토·멘티·운영사·발주처 모두. 귀속은 `program_members`(행사) + `support_type_members`(그룹 명부: 멘토·스태프) + `cases`(멘티는 케이스로 그룹 귀속). ~~**역할(`users.role`)은 계정 전역**으로 하나 — 한 사람이 행사마다 다른 역할을 가져야 하면 계정을 나눈다.~~ → **2026-09-08 개정(설계 B)**: 역할은 행사별 `program_members.role`, `users.role` 은 기본 역할. 가드가 컨텍스트 행사의 역할로 프로필을 치환하고, RLS 헬퍼는 `has_role`(어느 행사에서든)·`program_role(pid)`(행사 범위)로 재정의(0059).
2. **프로그램 격리는 두 겹.** (a) RLS 헬퍼 `private.is_program_member(program_id)` / `private.is_program_staff(program_id)` 를 스태프 정책에 결합, (b) 서비스롤 경로의 모든 스태프 조회·알림 수신자 조회에 **현재 행사 컨텍스트**(§18) 의 `program_id` 필터를 코드로 강제(`CURRENT-STATE.md §1-4` 의 `.eq('role', …)` 지점 전부는 `program_members` 조인으로 바뀐다).
3. **브랜딩·문구는 프로그램 설정에서 읽는다.** 행사 기본 탭에서 **발주처·용역사(운영) 기관명**을 등록하면 그 행사의 모든 화면·문서·알림에 반영된다(§17). `ROLE_LABELS` 의 "진흥원/넥스트랩" 하드코딩은 `roleLabel(role, branding)` 으로 대체. 원본 문자열 391줄 치환의 종착점.
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

### 1-6. 로그인 — **통합 로그인 + 행사/그룹 허브** (3차 답변으로 개정; 행사별 로그인 URL 은 폐기)
| URL | 내용 |
|---|---|
| `/login` | 모든 계정의 통합 로그인(플랫폼 브랜드). 플랫폼 관리자도 여기서 로그인 |
| `/hub` | 로그인 직후 진입. **활성 행사 배너**(로고·행사명·내 역할·내 그룹 수·미처리 건수) 목록. **종료된 행사** 는 별도 탭. 배너 클릭 → 행사 컨텍스트 진입(§18) |
| `/hub?program={id}` | 행사 안의 **그룹 배너**(활성/종료 탭). 배너 클릭 → 그룹 컨텍스트 진입 |
| 자동 진입 | 로그인 시 활성 행사가 **1개**면 허브를 건너뛰고 그 행사로, 그 안에 활성 그룹이 **1개**면 그 그룹까지 자동 진입. 스태프는 그룹 선택 없이 "행사 전체" 로도 들어갈 수 있다 |
| `/platform/*` | 플랫폼 관리자 콘솔(행사 개설·복제·계정). 관리자는 허브에도 모든 행사가 보인다 |
- 비밀번호 재설정(OTP)·최초 비밀번호 변경은 통합 화면. 브랜딩은 컨텍스트 진입 후부터 행사 값(§17).
- 세션 쿠키는 공용(Supabase Auth) — 격리는 멤버십 검사(§18).

### 1-5. 스키마 변경 (구현본은 `supabase/migrations/0046~0056`)
```sql
create table programs (
  id uuid pk, slug text unique, name text, status 'active'|'ended', starts_on, ends_on,
  client_name/client_short/client_seal_name/client_logo_path, operator_name/operator_short/operator_contact,   -- §17
  app_title, logo_path, sms_footer, email_subject_prefix,
  withholding_params jsonb,      -- { other_income:{expense_rate,tax_rate,local_rate,rounding,min_taxable_exempt}, business_income:{rate:0.033,...} }
  default_withholding_method text,  -- 'other_income' | 'business_income' | 'none'
  closure_policy jsonb,          -- { require_mentee_signature:false, require_group_docs:false, block_batch_on_missing_mentor_docs:false }
  default_required_rounds int default 4, created_by, created_at, updated_at
);
create table program_members (program_id, user_id, is_active, joined_at, left_at, note, unique(program_id,user_id));
alter table users add column is_platform_admin bool default false;          -- program_id 컬럼은 두지 않는다(다중 귀속)
alter table support_types add column program_id uuid not null, status, withholding_method text null …;
create table support_type_members (support_type_id, user_id, member_role 'mentor'|'staff', is_active, withholding_method text null, …);  -- 그룹 명부 + 멘토별 원천징수 override
create function private.is_program_member(pid uuid) / private.is_program_staff(pid uuid) / private.is_platform_admin();
```
RLS: 스태프 정책은 `private.is_program_staff(program_id)` 로 행사 범위를 좁힌다. 멘토·멘티는 케이스 배정 기준이라 추가 조건 불필요.

---

## 2. 역할 · 사업그룹

### 2-1. 역할 (enum 유지)
| 키 | 라벨 (프로그램 설정) | 모두의창업 기본값 | 하는 일 |
|---|---|---|---|
| `institution` | `client_short` (없으면 `client_name`) | 세종창조경제혁신센터 | 진행현황·정산 열람, **정산 확인(종결 확정)** |
| `nextlab` | `operator_short` (없으면 `operator_name`) | (주)렛츠 | 그룹 개설, 멘티·멘토 등록, 배정·변경, **종결 검수·정산 승인·지급 품의** |
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
| 3' | `reassignment_pending` | 멘토 중도 종료 · 재배정 대기 | rejected | 멘토의 중도 종료 요청을 렛츠가 승인 → 활성 배정 없음. 재배정되면 `in_progress` 로 복귀 |
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
| T10 | 비종결 → `withdrawn` (멘티 중도 종료) | staff | `withdrawCase` | `∉ {closed, withdrawn}` | 배정 해제. **이행 회차는 정산**: 담당 멘토(들)의 부분 정산 스냅샷 생성(§6-3 kind=`partial`) |
| T11a | `in_progress` → `reassignment_pending` (멘토 **자진** 중도 종료) | mentor 요청(사유) → nextlab 승인 | `requestMentorWithdrawal(reason)` → `approveMentorWithdrawal` / `rejectMentorWithdrawal` | `= in_progress` ∧ 활성 배정 = 요청 멘토 | 배정 종료(`end_kind='mentor_withdrawal'`, 사유 전체 공개), 해당 멘토 **부분 정산 스냅샷**(kind=`partial`) → `pending`, 알림 렛츠·멘티 |
| T11b | `in_progress`/`mentor_assigned` → `reassignment_pending` (운영사 **강제** 종료) | nextlab (사유 필수) | `forceEndMentor(reason)` | 활성 배정 존재 | 배정 종료(`end_kind='forced'`, `reason_visibility='staff_only'` → **운영사·발주처만 사유 열람**, 멘토·멘티 화면엔 "운영사 결정으로 종료" 만 표시), 이행 회차 있으면 부분 정산, 알림 멘토·멘티 |
| T12 | `reassignment_pending` → `in_progress` | nextlab | `assignMentor` (T2 와 같은 함수, 상태 분기) | `= reassignment_pending` ∧ 활성 배정 없음 | 새 멘토는 잔여 회차(`required_rounds − 이행 회차`)만 진행. 알림 새 멘토·멘티 |

UI 노출 규칙: 진행바(`CASE_STEP_ORDER`) = 1·2·3·4·5·6·7. `revision_requested` 는 4 단계에 반려 톤, `reassignment_pending` 은 3 단계에 반려 톤, `withdrawn` 은 0.
`mentor_assignments` 에 `ended_at timestamptz, ended_reason text, ended_by uuid` 를 추가해 중도 종료 사유(멘토 작성)를 배정 행에 남긴다.

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
4. **같은 멘티·같은 날 합산 상한**(답변 2): 같은 `case_id` · 같은 날짜(KST) 의 기존 회차와 합산해
   (a) 회차 수 ≤ `case_daily_round_limit`(기본 3), (b) `mode` 별 `amount_snapshot` 합 ≤ 그 유형의 `daily_cap_amount`(온라인 24만·오프라인 30만).
   초과 시 거부(메시지에 남은 한도 표시). 온·오프를 섞어도 (a) 로 하루 3회를 넘지 못한다.
5. **멘토 1일 건수**: 같은 `mentor_id` · 같은 날짜의 **distinct case_id** 수가 이미 `mentor_daily_case_limit`(기본 3) 이고 이번 케이스가 그 안에 없으면 거부.
6. 시간 겹침: 같은 멘토의 다른 회차와 `[started_at, ended_at)` 이 겹치면 거부.
7. 단가 스냅샷: `consulting_rates` 에서 `(program, support_type ?? null, mode, effective_from ≤ started_at::date)` 최신 1건. 없으면 거부("단가 미설정").

**모든 한도값은 행사 설정에서 읽는다**(답변 10·3차). 기본은 **행사 단위**(`support_type_id null` 행). 그룹 행이 있으면 그 그룹에서만 우선(선택 기능, 기본은 비움). 코드에 숫자를 박지 않는다. 설정 페이지는 §16.

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
| `case_doc` | **멘티 관련 서류**(자유 첨부) — `documents.mentor_visible` 로 멘토 공개/비공개 | 누적 | 없음 · RLS `documents_select` 가 멘토에게 `mentor_visible=true` 만 노출 + 코드 필터 이중 | mentee / nextlab / mentor(항상 공개) |

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
  daily_cap_amount numeric(14,2) not null,  -- 온라인 240,000 / 오프라인 300,000 (같은 멘티·같은 날)
  effective_from date not null, created_by uuid, created_at,
  unique (program_id, support_type_id, mode, effective_from)
);
-- 유형과 무관한 운영 한도 (그룹 override 가능, 이력 관리)
create table operating_limits (
  id uuid pk, program_id uuid not null, support_type_id uuid null,
  mentor_daily_case_limit int not null default 3,   -- 멘토 1일 최대 멘티 수
  case_daily_round_limit int not null default 3,    -- 같은 멘티 1일 최대 회차
  effective_from date not null, created_by uuid, created_at,
  unique (program_id, support_type_id, effective_from)
);
```
단가·한도 변경은 **행 추가**(effective_from)로만 한다. 과거 회차는 `unit_price_snapshot` 을 갖고 있어 흔들리지 않는다.

### 6-2. 계산 함수 — **한 곳** `src/lib/settlement/compute.ts` (순수 함수, 단위 테스트 필수)
```ts
computeSettlement(input: {
  rounds: { mode, unit_price_snapshot, amount_snapshot, is_extra, started_at, mentor_id }[],
  withholding: WithholdingPolicy,   // 프로그램 설정 (아래)
}): {
  lines: { mode, count, unit_price, amount }[],   // 유형별 내역 (+ 추가회차 줄)
  gross: number,                                  // 지급총액
  taxable: number,                                // 기타소득금액 = gross × (1 − expense_rate)
  income_tax: number,                             // 소득세 = taxable × tax_rate  (10원 미만 절사)
  local_tax: number,                              // 지방소득세 = income_tax × local_rate (10원 미만 절사)
  withholding: number,                            // 원천징수 합계
  net: number,                                    // 실지급요청액 = gross − withholding
}

WithholdingPolicy =
  | { method: 'other_income', expense_rate: 0.6, tax_rate: 0.20, local_rate: 0.10, rounding: 'floor_10', min_taxable_exempt: 50000 }  // 기타소득 8.8%
  | { method: 'business_income', tax_rate: 0.03, local_rate: 0.10, rounding: 'floor_10' }                                            // 사업소득 3.3%
  | { method: 'none' }
```
- 기타소득 실효세율 = 40% × 22% = **8.8%**. 예: 4회 오프라인 400,000 → 기타소득금액 160,000 → 소득세 32,000 + 지방세 3,200 = 35,200 → 실지급 364,800. 사업소득은 400,000 × 3.3% = 13,200 → 실지급 386,800.
- **적용 방식 결정 순서(3차 답변)**: ① 그룹 안의 **멘토별 설정**(`support_type_members.withholding_method`) → ② **그룹 일괄 설정**(`support_types.withholding_method`) → ③ 행사 기본(`programs.default_withholding_method`). 파라미터(세율 등)는 행사 설정 `programs.withholding_params` 에서 방식별로 읽는다. 멘토별 설정은 **그 그룹 안에서만** 유효하다.
- 화면의 "예상 비용"(§4-2)과 T7 의 확정 저장이 **같은 함수**를 호출한다. 정산 스냅샷에 **적용 방식 + 당시 파라미터**를 저장한다(소급 방지).
- 테스트 러너: 리포에 없음 → `vitest` 추가(`npm run test` 를 검증 3종에 4번째로 편입). 테스트 케이스: 유형 혼합, 추가 회차, 과세최저한 경계, 절사, 멘토 2명 분할.

### 6-3. 예상 vs 확정
| 구분 | 원천 | 노출 | 저장 |
|---|---|---|---|
| 예상 | `mentoring_logs` 실시간 집계 | 렛츠 대시보드·멘토 화면 "예상 정산액(미확정)" 배지 | 저장 안 함 |
| 확정 | T7 시점 `computeSettlement` 결과 | 렛츠·센터·멘토 | `settlements` 1행 + `settlement_statement` PDF |

```sql
create table settlements (
  id uuid pk, program_id uuid not null,
  case_id uuid not null, mentor_id uuid not null,   -- 정산 단위 = 케이스 × 멘토 (답변 6)
  kind text check in ('closure','partial') not null,-- closure: 종결 검수 승인 / partial: 멘토 중도 종료·멘티 중도 종료
  status text check in ('pending','batched','confirmed','paid') default 'pending',
  lines jsonb not null, gross numeric, taxable numeric, income_tax numeric, local_tax numeric,
  withholding numeric, net numeric, withholding_policy jsonb not null,   -- 적용 당시 세율 파라미터
  rounds_snapshot jsonb not null,               -- 회차 id·일시·유형·단가 목록 (감사용)
  confirmed_by uuid, confirmed_at timestamptz,  -- 렛츠 확정
  batch_id uuid references settlement_batches(id),
  paid_at timestamptz, created_at,
  unique (case_id, mentor_id)                   -- 한 멘토는 한 케이스에서 한 번만 정산
);
```
- **케이스 상태와 정산 상태의 관계**: 케이스 상태(`settlement_pending → settlement_batched → closed`)는 그 케이스의 **`closure` 정산**의 status 를 따라간다. `partial` 정산은 케이스 상태와 무관하게 자체 status 로 품의에 실린다(케이스는 새 멘토와 계속 진행).
- 정산 대상 회차 = `mentoring_logs where case_id = ? and mentor_id = ?` 중 아직 어떤 정산에도 포함되지 않은 것(`mentoring_logs.settlement_id` 로 표시). 같은 회차가 두 번 정산되지 않는다.
- 확정 후 회차 편집은 잠금. 예외는 렛츠의 "확정 취소(사유 필수, `pending` 이고 품의 미편성일 때만)" — 감사로그 필수.

### 6-4. 지급 품의 (`settlement_batches`)
```sql
create table settlement_batches (
  id uuid pk, program_id uuid not null, title text not null,   -- '2026-10 1차 지급 품의'
  status text check in ('draft','submitted','confirmed','paid') default 'draft',
  created_by uuid, submitted_at, confirmed_by uuid (institution), confirmed_at, paid_at,
  total_gross numeric, total_withholding numeric, total_net numeric, created_at
);
```
렛츠: `status = pending` 인 **정산 건**(closure·partial 모두)을 체크박스로 골라 품의 생성(draft) → 제출(submitted, T8) → 센터: 품의 상세에서 **"정산 확인"**(confirmed → 포함된 `closure` 정산의 케이스는 T9 `closed`, `partial` 은 정산 건만 confirmed) → 렛츠: 실제 지급 후 `paid` 표시. 품의서 PDF/엑셀 내보내기 제공(멘토별 합계·원천징수 내역 포함).

### 6-5. 통보
T7 확정 시 멘토에게 인앱 + 문자(`queueNotification`, 기존 큐·Cron 재사용): "○○ 멘티 정산 확정 — 온라인 N회·오프라인 M회, 합계 X원, 원천징수 Y원, 실지급 Z원". 문자는 try/catch 격리(CLAUDE.md §6-5).

### 6-6. 중도 종료 시 이행 회차 (답변 6 확정)
| 경우 | 트리거 | 정산 | 케이스 |
|---|---|---|---|
| **멘토 중도 종료** | 멘토가 사유 작성 → 렛츠 승인 (T11) | 그 멘토의 이행 회차로 `partial` 정산 생성(`pending`) | `reassignment_pending` → 타 멘토 배정(T12) → 잔여 회차 진행 → 종결 시 새 멘토 `closure` 정산 |
| **멘티 중도 종료** | 렛츠 `withdrawCase` (T10, 사유) | 활성 멘토의 이행 회차로 `partial` 정산 생성 | `withdrawn` 종결 |
이행 회차가 0이면 정산 행을 만들지 않는다. 부분 정산도 §6-2 같은 함수·같은 원천징수 정책을 쓴다.

---

## 7. 멘티 기능

| 기능 | 데이터 | 흐름 | 게이트 |
|---|---|---|---|
| **회차 서명** | `signatures(signer_type=mentee, document_type='mentoring_log', log_id)` + `mentoring_logs.mentee_signed_at` | 멘티 대시보드 "서명 대기 회차" → 캔버스 서명 | 프로그램 설정 `require_mentee_signature_for_closure`(**기본 false**, 답변 4)면 T5 게이트 |
| **만족도 조사** | §7-2 설문 템플릿(그룹별 표준양식) + `survey_responses` | `closure_requested` 부터 노출, 1회 제출 | T9 게이트로 두지 않음(멘티 미응답이 정산을 막으면 안 됨) — 미제출 시 리마인더 문자 |
| **멘토 변경 요청** | `mentor_change_requests(case_id, requested_by, reason, status pending/accepted/rejected, handled_by, note)` | 멘티 → 렛츠 요청함 → 수락 시 T3 `reassignMentor` 호출 | 진행 중 상태에서만 |
| 진행 열람 | 기존 `mentee-journey` 재사용 (7단계) | | |
| 필수서류 업로드 | §5-3 | | |

기존 멘티 화면 중 `pre-support` `post-support` `contractor-signatures` `support-scope` 는 제거.

### 7-2. 만족도 조사 — 그룹별 표준양식 (답변 5)
```sql
create table survey_templates (
  id uuid pk, program_id uuid not null, support_type_id uuid null,   -- null = 프로그램 공통 양식
  name text not null, version int not null default 1, is_active bool default true,
  created_by uuid, created_at, unique (program_id, support_type_id, version)
);
create table survey_questions (
  id uuid pk, template_id uuid not null, sort_order int not null,
  qtype text check in ('scale','single','multi','text','rank') not null,  -- 5점척도 / 단일선택 / 복수선택 / 주관식 / 순위
  label text not null, help text,
  options jsonb,                -- single/multi/rank 의 보기 목록, scale 의 min/max/라벨
  required bool default true
);
create table survey_responses (
  id uuid pk, case_id uuid not null unique, template_id uuid not null, mentee_id uuid not null,
  answers jsonb not null,       -- { questionId: value | value[] | rankedIds[] | text }
  score numeric,                -- scale 문항 평균(대시보드용, 파생)
  submitted_at timestamptz not null default now()
);
```
- 운영 설정 페이지(§16)에서 템플릿을 만들고 문항을 추가·정렬·유형 선택한다. 응답이 1건이라도 생기면 템플릿은 **잠금**(수정하려면 새 버전 생성).
- 케이스에 노출되는 양식 = 그룹 지정 활성 템플릿 → 없으면 프로그램 공통 활성 템플릿.
- 기본 시드: 5점 척도 5문항(전문성·성실성·도움 정도·의사소통·재참여 의향) + 주관식 1문항.
- 결과: 그룹·멘토별 평균 점수 대시보드(센터·렛츠), 멘토 본인은 익명 집계만 열람. CSV 내보내기.

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
> ✅ **2026-09-07 P1 완료** — 아래 10개를 작성해 Supabase `modu` 에 적용했고 `src/types/database.ts` 를 재생성했다(41개 테이블).

| 번호 | 내용 |
|---|---|
| 0046 | `programs`(브랜딩·원천징수 파라미터·종결 게이트) + `program_members`(1계정 다중 행사) + `users.is_platform_admin` + `private.is_platform_admin / is_program_member / is_program_staff / is_program_nextlab / shares_program_with` + `users_select` 행사 범위 |
| 0047 | `support_types` 동적화(enum→text, `program_id`, `required_rounds`, `withholding_method`, `predecessor`, status) + `support_type_documents.multiple/for_role` + **`support_type_members`**(그룹 명부·멘토별 원천징수 override) |
| 0048 | `case_status` v2 10개 재생성, `cases` 정리(보조금 컬럼 삭제, `program_id`·`predecessor_case_id`·종료 필드, 행사 일치 트리거), `mentor_assignments.ended_* / end_kind / reason_visibility`, `mentor_withdrawal_requests`, `can_access_case` 행사 범위 재정의 |
| 0049 | `consulting_mode` + `consulting_rates` + `operating_limits`(행사 기본·그룹 override) + `mentoring_logs` v2(round_no·mode·started/ended·스냅샷·서명·추가회차) + `round_extension_requests` |
| 0050 | `settlement_batches` + `settlements`(케이스×멘토, closure/partial, 방식·파라미터 스냅샷) + `mentoring_logs.settlement_id` |
| 0051 | `mentor_change_requests` + `survey_templates/questions/responses`(응답 시 잠금 트리거) + `mentor_group_reviews` + `reviews` 종결 검수 재사용 |
| 0052 | `documents` 단일본 인덱스 v2 + `doc_key not null` |
| 0053 | 레거시 삭제(`contractors` `support_applications` `payment_applications` `approvals` `case_edit_grants`) + `app_settings`·`document_templates`·`notifications`·`audit_logs` 행사 범위 |
| 0054 | `tag_catalog` + `mentor_profiles` + `mentee_profiles` + `match_recommendations` + `mentor_payment_docs` |
| 0055 | 시드: 행사 `modu-2026`(발주처·용역사 기관명) + 그룹 A~D(회차 4) + 단가 + 한도 + 표준 만족도 양식 6문항 + 키워드 14개 + 주간 안내문 플레이스홀더화 |
| 0058 | P6: `document_templates` 그룹 범위 유니크·`is_active`·`updated_by` / `programs.round_report_policy`·`support_types.round_report_policy` / `mentor_signatures` |
| 0057 | P5: `signatures.log_id`(회차 서명 연결, 회차×서명자 유니크) |
| 0056 | P3: `documents.mentor_visible`·`uploaded_role` + 멘토 열람 RLS / `observation_reports`(웹 작성 초안, case_id PK) / `program_sms_settings`(행사별 문자 API, 봉투암호화, **RLS 정책 없음 = 서비스롤 전용**) + `program_sms_access_log` |

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
`src/lib/settlement/{compute.ts, compute.test.ts, withholding.ts, actions.ts, batches.ts}`, `src/lib/programs/{data.ts, actions.ts, branding.ts, limits.ts}`, `src/app/(platform)/platform/{login, programs, programs/new, programs/[id]}`, `src/app/[slug]/(auth)/{login, reset-password, change-password}` + `src/middleware.ts` 슬러그 해석, `src/lib/workflow/{closure-actions, extension-actions, mentor-change-actions, mentor-withdrawal-actions, survey-actions, settings-actions, mentor-docs-actions}.ts`, `src/lib/matching/{score.ts, score.test.ts, rationale.ts (Claude API), actions.ts}`, `src/app/(operator)/operator/{settings, mentors, settlements, batches}`, `src/components/{settlement, programs, rounds, observation, survey, matching, settings}`.
패키지 추가: `@anthropic-ai/sdk`(매칭 근거), `vitest`(정산·점수 테스트).

---

## 11. 열린 항목 — 1차 9건은 §0-2 로 **전부 확정**. 남은 것(기본값으로 진행):
1. 기타소득 파라미터 기본값(필요경비 60%·세율 20%·지방세 10%·10원 미만 절사·과세최저한 5만원 적용). 회계 담당자 확인 권장 — 설정 페이지에서 바꿀 수 있으므로 구현은 막히지 않음.
2. 매칭 추천의 **자동 배정 금지** — 추천은 후보 3~5명 + 근거까지만, 배정 버튼은 렛츠가 누른다(§14). 자동 배정을 원하면 별도 지시.
3. 멘토 지급서류 3종(이력서·통장사본·신분증사본)의 **파일 업로드 보관** 여부 — 기본은 "수령 체크"만(§15). 파일 보관은 개인정보(신분증) 보존기간 정책이 필요.
4. 그룹별 회차 수 A~D 실제 값 — 시드 4, 설정 페이지에서 조정(답변 8).

---

## 14. AI 멘토 매칭 추천 (답변 10)

### 14-1. 데이터 — 다중 키워드 프로필
```sql
create table tag_catalog (            -- 프로그램별 키워드 사전 (자동완성·통계용, 자유 입력도 허용)
  id uuid pk, program_id uuid not null, category text not null,  -- 'industry' | 'expertise' | 'stage' | 'region' | 'need' | 'custom'
  label text not null, sort_order int, unique (program_id, category, label)
);
create table mentor_profiles (
  user_id uuid pk references users(id), program_id uuid not null,
  industries text[] default '{}', expertise text[] default '{}', regions text[] default '{}',
  stages text[] default '{}',           -- 예비/초기/성장
  modes consulting_mode[] default '{online,offline}',
  capacity int default 5,               -- 동시 담당 멘티 상한 (부하 계산)
  career text, bio text,                -- 정성 근거의 재료 (경력·소개)
  keywords text[] default '{}',         -- 자유 키워드
  updated_at
);
create table mentee_profiles (
  case_id uuid pk references cases(id), program_id uuid not null,
  industry text, stage text, region text, preferred_mode consulting_mode,
  needs text[] default '{}',            -- 원하는 도움 (마케팅/재무/법무/제품…)
  keywords text[] default '{}', summary text,   -- 사업 소개·현황·고민 (정성 근거의 재료)
  updated_at
);
create table match_recommendations (
  id uuid pk, program_id uuid not null, case_id uuid not null, mentor_id uuid not null,
  rank int not null, score numeric not null,              -- 0~100
  objective jsonb not null,   -- { tag_overlap: {industry:2, expertise:3, need:1}, region_match: true, mode_match: true, load: {current:3, capacity:5}, prior_cases_with_mentee: 0 }
  rationale text not null,    -- 정성 근거 (모델 생성, 한국어 2~4문장)
  model text not null, prompt_version text not null, generated_at timestamptz, generated_by uuid,
  adopted_at timestamptz,     -- 이 추천으로 실제 배정된 경우 기록
  unique (case_id, mentor_id, generated_at)
);
```
- 멘토·멘티 등록 화면(렛츠)과 본인 프로필 화면에서 키워드를 **다중 입력**(칩 UI, 카탈로그 자동완성 + 자유 입력). CSV 일괄 등록 지원.

### 14-2. 추천 파이프라인 (서버 액션 `recommendMentors(caseId)`)
1. **객관 점수(코드, 결정적)** — 같은 프로그램의 활성 멘토 전원에 대해: 태그 겹침(카테고리별 가중치), 지역·유형 일치, 현재 부하(활성 배정 수 / capacity), 승계 케이스면 이전 멘토 가점, 1일 3건 등 한도 위반 가능성. 상위 8명을 후보로 추린다. 이 단계만으로도 추천이 나온다(모델 장애 시 폴백).
2. **정성 근거(모델)** — 후보 8명의 `career/bio/keywords` 와 멘티 `summary/needs` 를 넣고 **Anthropic Claude API**(`@anthropic-ai/sdk`, 모델 `claude-opus-5`, 적응형 thinking, `output_config.format` 구조화 출력)로 "상위 3~5명 순위 + 각 2~4문장 근거 + 주의점"을 JSON 으로 받는다. 개인정보(연락처·사업자번호)는 프롬프트에서 제외.
3. 저장 → 화면: 렛츠 배정 패널에 추천 카드(점수·객관 요인 표·정성 근거). **배정은 렛츠가 클릭** — 자동 배정 없음. 채택 시 `adopted_at` 기록으로 추천 정확도를 나중에 측정.
4. 비용·지연: 케이스당 1회 호출(재생성 버튼), 결과 캐시. `ANTHROPIC_API_KEY` 환경변수 추가. 키 미설정이면 1단계 객관 점수만으로 동작.

### 14-3. 근거 기록 원칙
- `objective` 는 숫자·불리언만(재현 가능). `rationale` 은 모델 출력 원문 + `model`/`prompt_version` 을 남겨 나중에 "왜 이 멘토였나"를 감사할 수 있게 한다.
- 추천을 무시하고 다른 멘토를 배정하면 배정 감사로그에 `recommended_rank: null` 을 남긴다.

---

## 15. 멘토 지급서류 수령 체크 (답변 10)
```sql
create table mentor_payment_docs (
  user_id uuid pk references users(id), program_id uuid not null,
  resume_received_at timestamptz, bankbook_received_at timestamptz, id_card_received_at timestamptz,
  note text, checked_by uuid, updated_at
);
```
- 화면: 렛츠 **멘토별 명단**(`/operator/mentors`)에 3개 체크 열(이력서·통장사본·신분증사본) + 미수령 필터 + 정산 화면에 "서류 미비" 배지(지급 품의 편성 시 경고, 차단은 하지 않음 — 설정으로 차단 전환 가능).
- **비밀번호 재입력**: 체크 입력/변경 서버 액션은 `password` 를 함께 받아 실행자(실제 신원, `getRealSessionProfile`)의 이메일로 `signInWithPassword` 재인증에 성공해야 저장한다. 실패 3회 시 5분 잠금(`app_settings` 카운터). 대행(view-as) 중에는 불가.
- **일괄 입력**: 멘토 다중 선택 → "수령 일괄 체크" 모달(항목 선택 + 비밀번호 1회) → 한 트랜잭션으로 저장, 감사로그는 멘토별 1건씩(`mentor.payment_doc_check`, before/after).
- 파일 자체는 보관하지 않는다(§11-3). 보관이 필요해지면 `documents` 의 케이스 스코프가 아닌 **사용자 스코프 버킷**(`mentor-docs/{userId}/`)을 별도로 설계한다.

---

## 16. 운영기관 설정 페이지 (`/operator/settings`, nextlab 전용)
| 탭 | 항목 | 저장처 | 비고 |
|---|---|---|---|
| 행사 기본 | **발주처 기관명 / 용역사(운영) 기관명** + 약칭·직인 명의·대표 연락처·로고·앱 타이틀·문자 꼬리말 — 저장 즉시 **해당 행사 전체 화면·문서·알림에 반영**(§17) | `programs` | 플랫폼 관리자도 편집 가능 |
| 사업그룹 | 그룹 추가·이름·코드·**회차 수(기본 4)**·기간·승계 원천 그룹·활성 | `support_types` | 답변 8 |
| 단가·한도 | 유형별 단가·일일 금액 상한, 멘토 1일 건수, 멘티 1일 회차 — **그룹별 override**, 적용일 | `consulting_rates`, `operating_limits` | 이력 행 추가 방식. 답변 10 |
| 정산 | 행사 기본 원천징수 방식 + 방식별 파라미터, **그룹별 일괄 방식**(기타소득/사업소득/없음), **그룹 내 멘토별 방식**(멘토 명부에서), 정산서 서식 | `programs.default_withholding_method / withholding_params`, `support_types.withholding_method`, `support_type_members.withholding_method` | 답변 1·3차 |
| 종결 게이트 | 멘티 서명 필수 / 필수서류 완료 필수 / 지급서류 미비 시 품의 차단 | `programs.closure_policy jsonb` | 답변 4 기본 false |
| 필수서류 | 그룹별 문서 슬롯(`support_type_documents`) | 기존 화면 재사용 | |
| 만족도 양식 | 템플릿·문항·유형·순서, 그룹 지정 | `survey_*` | 답변 5 |
| 키워드 사전 | 카테고리별 태그 관리 | `tag_catalog` | §14 |
| 보고서 양식·서명 정책 | 행사/그룹 양식 HTML, 멘티 확인 서명·멘토 자동 서명 | `document_templates`, `programs/support_types.round_report_policy` | §22 |
| 알림 | 이벤트별 채널 on/off·문구 | `app_settings(program_id)` | P7 이후 (기존 문자 설정 화면 사용) |
모든 저장은 감사로그(`settings.update`, before/after). 숫자 한도는 "적용일" 을 받아 이력 행으로 추가한다(과거 정산 불변).

---

## 17. 브랜딩 치환 지도 — 발주처 / 용역사(운영) 기관명은 **한 곳에서 등록, 행사 전체에 반영**

### 17-1. 저장 필드 (`programs`)
| 필드 | 예 (모두의창업) | 쓰이는 곳 |
|---|---|---|
| `client_name` | 세종창조경제혁신센터 | 발주처 정식 명칭 — 문서·약관·이메일 |
| `client_short` | 센터 | 발주처 약칭 — 역할 라벨·배지·버튼 문구·안내문 |
| `client_seal_name` | 세종창조경제혁신센터장 | 서식 직인란 (원본 `templates.ts:14 INSTITUTION` 대체) |
| `operator_name` | (주)렛츠 | 용역사(운영) 정식 명칭 |
| `operator_short` | 렛츠 | 용역사 약칭 — 역할 라벨·안내문 |
| `operator_contact` | 대표 전화·이메일 | 약관·개인정보처리방침·문의 안내 |
| `program_name` / `app_title` | 모두의창업 / 모두의창업 운영관리 | `<title>`, PWA 이름, 로그인 헤더, 보고서 제목 |
| `logo_path`, `client_logo_path` | | 로그인·헤더·PDF 머리글 |
| `sms_footer` | -모두의창업 | 문자 꼬리말 |
| `email_subject_prefix` | [모두의창업] | 이메일 제목 접두 (원본 `[OP.map]` 대체) |
약칭을 비우면 정식 명칭을 쓴다. 저장 시 필수: `client_name`, `operator_name`, `program_name`.

### 17-2. 읽는 방법 — 단일 진입점
```ts
// src/lib/programs/branding.ts
export type Branding = { clientName, clientShort, clientSealName, operatorName, operatorShort, operatorContact, programName, appTitle, logoPath, clientLogoPath, smsFooter, emailSubjectPrefix, appUrl };
export const getBranding = cache(async (programId): Promise<Branding>);   // 서버 (React cache, 요청당 1회)
export function roleLabel(role: UserRole, b: Branding): string;           // institution → clientShort, nextlab → operatorShort
export function fmt(template: string, b: Branding, vars?): string;        // '{client} 승인 대기' 같은 문구 치환
```
- 클라이언트 컴포넌트에는 `BrandingProvider`(layout 에서 1회 주입) + `useBranding()`.
- **문자열 상수 파일에는 기관명을 쓰지 않는다.** 문구는 `{client}` `{operator}` `{program}` 플레이스홀더로 두고 `fmt()` 로 치환한다.
- 원본 `ROLE_LABELS` 는 `roleLabel(role, branding)` 으로 대체. `MENTOR_ONLY_ERROR` 같은 안내 문구도 함수화.

### 17-3. 반영 지점 전수 (원본 잔재 391줄의 종착점 — `CURRENT-STATE.md §4`)
| 표면 | 반영 방식 |
|---|---|
| 헤더·역할 배지·회원관리 역할 필터 | `roleLabel()` |
| 로그인(`/{slug}/login`)·비밀번호 변경·OTP | 로고 + `program_name` + "`{client_name} × {operator_name}`" |
| `<title>`·`manifest.ts`·PWA 이름 | `app_title` (레이아웃에서 프로그램 해석 후 `generateMetadata`) |
| 대시보드·케이스 상세·타임라인 라벨(예: "렛츠 검수 완료", "센터 정산 확인") | `CASE_STATUS_META.label` 을 `{operator}` `{client}` 템플릿으로 두고 렌더 시 `fmt()` |
| 버튼·안내·에러 문구(예: "담당 멘토만 실행할 수 있습니다. {operator}는 회원관리에서…") | `fmt()` |
| 사용 안내 페이지(`institution-guide`, `mentor-guide`) | 본문 전체 템플릿화 |
| 이용약관·개인정보처리방침 | 책임 기관 = `client_name`, 운영기관 = `operator_name`, 연락처 = `operator_contact` |
| PDF 서식(관찰의견서·정산서·품의서·보고서 머리글·직인란) | `buildTemplateData()` 에 `client_seal_name`·로고 주입 |
| 알림 문자·이메일 본문·제목 | `templates.ts` 플레이스홀더 + `sms_footer` + `email_subject_prefix`, URL 은 `appUrl/{slug}/…` |
| 주간 리마인더 등 `app_settings` 문구 | 프로그램별 행(`program_id`) + 플레이스홀더 |
| 정산서·품의서 엑셀 내보내기 | 시트 머리글에 발주처·용역사 |
| 만족도 조사 안내·설문 머리글 | `program_name` |

### 17-4. 강제 장치
- 코드 `src/` 에 기관명 리터럴(세종·렛츠·진흥원·넥스트랩·대전·restart.poclab.kr·OP.map)이 **0건**이어야 한다.

(§17 계속은 위. 아래 §18~§20 은 3차 답변 신규.)

---

## 18. 행사/그룹 컨텍스트 — 허브 배너, 자동 진입, 상단 표시

### 18-1. 컨텍스트 저장
- 현재 행사·그룹은 **서명된 쿠키** `modu_ctx = {programId, supportTypeId|null}` 에 둔다(대행 쿠키와 같은 방식, `VIEW_AS_SECRET` 파생 키). URL 재구성(`/{slug}/…`) 대신 쿠키를 택한 이유: 원본 라우트 구조(`(operator)/(mentor)/(mentee)/(institution)`)를 유지해 개조량을 줄이고, 북마크가 컨텍스트 안에서 그대로 동작.
- 서버: `getContext()` 가 쿠키를 읽고 **매 요청 멤버십을 재검증**(`program_members` 활성 + 그룹이면 `support_type_members`/케이스 존재). 실패하면 `/hub` 로. 모든 데이터 조회는 `ctx.programId`(+`ctx.supportTypeId`) 로 필터.
- 같은 브라우저에서 탭마다 다른 행사를 열면 마지막 선택이 이긴다 → 상단 컨텍스트 바에 항상 행사/그룹명과 **전환 버튼**을 두어 오인을 막는다.

### 18-2. 허브 (`/hub`)
| 구역 | 내용 |
|---|---|
| 활성 행사 탭 | 배너 카드: 로고·행사명·기간·내 역할·활성 그룹 수·**내 미처리 건수**(멘토: 서명 대기·미등록 회차 / 렛츠: 검수 대기·요청함 / 센터: 품의 확인 대기 / 멘티: 서명·설문) |
| 종료 행사 탭 | `programs.status='ended'` 또는 내 멤버십 `left_at` 이 있는 행사. 읽기 전용 진입(정산 내역·이력 열람) |
| 행사 클릭 → 그룹 배너 | 활성/종료 탭 동일. 스태프에게는 "행사 전체" 카드가 맨 앞. 멘티는 케이스가 있는 그룹만, 멘토는 명부에 있는 그룹만 |
| 자동 진입 | `active programs = 1` → 그 행사로. 그 안에서 `내 활성 그룹 = 1` (스태프는 그룹 수 = 1) → 그 그룹으로. 둘 다 아니면 허브 표시 |

### 18-3. 상단 컨텍스트 바 (모든 역할 레이아웃 공통)
`[로고] 행사명  ›  그룹명(있으면)  [전환]` — 그룹 미선택 시 "행사 전체". 행사명은 `programs.name`, 그룹명은 `support_types.name`. `<title>` 도 `그룹명 · 행사명 · 앱타이틀` 순.

### 18-4. 멤버십 관리
- 렛츠 회원관리: 계정 발급 시 행사 멤버십 자동 부여 + 그룹 명부 선택(멘토). 기존 계정(다른 행사 소속)을 **이메일/휴대폰으로 검색해 이 행사에 초대** — 새 계정을 만들지 않는다.
- 플랫폼 관리자: 행사 간 계정 복제 없이 멤버십만 추가. 행사 종료 처리(`status='ended'`) 시 멤버십은 유지(이력 열람).

---

## 19. 리포트 · 대시보드 (발주처 / 운영사)

### 19-1. 대시보드 — 통계 타일(직관) + 타일 클릭 → 팝업 상세(테이블·CSV)
| 구역 | 타일 | 팝업 내용 |
|---|---|---|
| 수행 성과 | 케이스 수(상태별 도넛) · **이행 회차 / 계획 회차**(진행률 바) · 완료 회차(확정) · 종결 케이스 · 종결률 | 케이스 목록(그룹·멘토·상태·회차 n/N), 상태별 필터 |
| 비수행 잔여 과업 | 미배정 케이스 · 잔여 회차 합계 · **정체 케이스**(최근 N일 회차 없음) · 검수 대기(종결 요청) · 보완 요청 중 · 재배정 대기 · 멘티 미서명 회차 · 미응답 설문 · 지급서류 미비 멘토 · 미처리 요청(추가회차/멘토변경/중도종료) | 항목별 리스트 + 담당자 + 경과일, 바로가기 |
| 성과평가 | 만족도 평균(그룹·멘토별 막대) · 멘토 운영사 평가 평균(§20) · 관찰의견서 제출률 | 응답 분포, 문항별 점수, 멘토별 순위 |
| 정산 | **예상 정산액(미확정)** · 확정 대기 · 품의 편성 · 센터 확인 완료 · 지급 완료 · 원천징수 합계 | 정산 건 목록(멘토·케이스·kind·금액), 품의별 소계, 방식별(기타/사업) 소계 |
- 발주처 대시보드는 같은 타일에서 **편집 버튼만 없다.** 그룹 필터(컨텍스트) 적용.
- 수치는 `src/lib/reports/metrics.ts` 한 곳에서 계산(대시보드 타일·팝업·리포트 화면이 같은 함수).

### 19-2. 리포트 메뉴 (`/operator/reports`, `/institution/reports`)
| 리포트 | 내용 | 내보내기 |
|---|---|---|
| 진행현황 | 그룹×상태 매트릭스, 케이스별 회차 타임라인 | CSV/XLSX |
| 멘토 실적 | 멘토별 담당 케이스·이행/완료 회차·온/오프 비율·종결·정산액·만족도·운영사 평가 | CSV/XLSX |
| 그룹 실적 | 그룹별 위 지표 + 승계 현황 | CSV/XLSX |
| 정산 | 기간·품의·멘토·방식별 집계, 원천징수 명세(세무 제출용) | XLSX |
| 만족도 | 템플릿별 문항 통계·주관식 원문 | CSV |
| 잔여 과업 | §19-1 두 번째 구역의 전체 리스트 | CSV |
| 감사 | 상태 전이·설정 변경·강제 종료 이력 | CSV |
기간·그룹·멘토 필터 공통. 차트는 대시보드와 같은 팔레트.

---

## 20. 그룹별 멘토 명부 — 운영사 평가·메모
```sql
create table mentor_group_reviews (
  id uuid pk, program_id uuid not null, support_type_id uuid not null, mentor_id uuid not null,
  author_id uuid not null,                 -- 운영사 담당자
  rating smallint check (rating between 1 and 5),   -- null 허용(메모만)
  memo text, tags text[] default '{}',
  created_at timestamptz not null default now()     -- append-only (수정 대신 새 행, 삭제는 soft: deleted_at)
);
```
- 화면: 그룹 컨텍스트의 멘토 명부(`/operator/mentors`) 각 행에 **평가(별점)·메모 추가** + 최근 평가 요약. 평가·메모는 **그 그룹 활동에만 귀속**되어 다른 그룹 명부에는 나타나지 않는다.
- **멘토별 통합 로그**(`/operator/mentors/[id]/log`): 그 멘토가 속했던 모든 행사·그룹의 평가·메모·실적·정산·중도 종료 이력을 시간순으로. 열람 권한 = 해당 행사들의 스태프 멤버 또는 플랫폼 관리자(다른 행사 항목은 그 행사 멤버가 아니면 "비공개 항목 N건" 으로 접힘). 데이터 통합 활용을 위해 `program_id`·`support_type_id` 를 모두 갖고 CSV 내보내기 제공.
- 발주처는 열람만(설정으로 숨김 가능), 멘토 본인에게는 비공개. `scripts/check-brand-strings.sh` 를 `npm run lint` 앞단에 붙여 1건이라도 있으면 실패.
- 시드(0054)에만 모두의창업 값을 넣는다. 새 행사는 마법사(§1-4 ①)에서 입력.
- 변경 시 감사로그 + 캐시 무효화(`revalidateTag('program:'+id)`). 이미 생성된 PDF 는 그대로 두고(문서 이력), 이후 생성분부터 새 명칭.

---

## 21. 행사별 문자 API 자격증명 — 다중 보안 (2026-09-07 요청)

운영사가 `/nextlab/settings/sms-api` 에서 행사별 솔라피 API 키·시크릿·발신번호를 등록한다. 유출 방지 장치는 **7겹**이며 어느 하나가 뚫려도 평문이 나오지 않게 설계했다.

| # | 계층 | 구현 |
|---|---|---|
| 1 | **봉투 암호화** | 행사마다 DEK(32B) 생성 → 값은 DEK 로 AES-256-GCM, DEK 는 환경변수 `SMS_KEK` 로 래핑. DB 만 털려도(KEK 없음) · 서버 환경변수만 새어도(암호문 없음) 복호화 불가 (`src/lib/sms/secrets.ts`) |
| 2 | **AAD 바인딩** | 암호문마다 `${programId}:${field}` 를 GCM 추가인증데이터로 묶어 **행 복사·필드 바꿔치기·타 행사 이식이 복호화 실패**로 끝남 |
| 3 | **테이블 접근 차단** | `program_sms_settings` 는 RLS 활성 + **정책 0개** → anon/authenticated 로는 읽기·쓰기 자체가 불가. 서비스롤 서버 코드만 접근 |
| 4 | **표시 최소화** | 화면·서버 액션 응답에는 힌트(키 앞 4자·번호 뒤 4자)와 HMAC 지문만. 저장 후 원문 재조회 경로 없음 (`getProgramSmsSettingsView`) |
| 5 | **비밀번호 재인증 + 잠금** | 등록·교체·비활성화는 로그인 세션과 별개로 **현재 비밀번호 재입력** 필수. 5회 실패 시 15분 잠금 (`src/lib/sms/reauth.ts`) — 대행(view-as) 중에는 실행자 본인 비밀번호 |
| 6 | **접근 감사** | `program_sms_access_log` 에 set/rotate/disable/test_send/send_use/decrypt_fail/reauth_fail 전부 기록 + `audit_logs`. 설정 화면에 최근 30건 표시 |
| 7 | **발송 격리·폴백** | 발송 시 `resolveSmsCredentials(programId)` 로 복호화 → 메모리에서만 사용. 행사 설정이 활성인데 복호화 실패면 **플랫폼 키로 새지 않고 실패**(`program_sms_credentials_unavailable`). 미등록/비활성 행사만 플랫폼 `SOLAPI_*` 폴백 |

- KEK 교체(`SMS_KEK` 변경) 시 기존 암호문은 복호화 불가 → 운영사 재등록. `enc_version` 컬럼으로 향후 재암호화 마이그레이션 여지.
- 문자 발송부 `sendSms(to, text, programId)` 는 `dispatch.ts` 가 알림의 `program_id` 를 넘긴다. 서비스롤 경로에서만 호출.

---

## 22. 컨설팅 보고서 양식 · 서명 정책 (2026-09-07 추가 요건)

- **양식 등록**: `document_templates(template_key='mentoring_report', program_id, support_type_id null=행사 공통)` — 운영 설정 "보고서 양식" 탭에서 HTML + 플레이스홀더로 등록. 해석 순서 **그룹 양식 → 행사 공통 양식 → 내장 기본 양식**(`DEFAULT_ROUND_REPORT_TEMPLATE`, 멘토·멘티 서명 컬럼 포함). 스크립트 금지, 미리보기(iframe srcDoc).
- **PDF 재생성**: 웹 작성 회차는 `renderRoundReport(logId)` 가 **저장·수정·멘티 서명** 시점마다 양식으로 PDF 를 만들어 `mentoring_report:{logId}` 단일본으로 교체(파일 업로드 회차는 그대로). 실패해도 회차 저장은 유지, `round.report_render_failed` 감사.
- **서명 정책** `round_report_policy {mentee_confirm_signature, mentor_auto_sign}` — 행사 기본(`programs`) + 그룹 override(`support_types`, null=상속).
  - `mentee_confirm_signature`: 회차 등록 시 멘티에게 알림 발송 → 멘티가 확인 서명(`/mentee/rounds`) → 서명 후 멘토 수정 잠금·PDF 재생성. 꺼져 있으면 알림·서명 버튼 없음.
  - `mentor_auto_sign`: 보고서 저장 시 멘토의 등록 서명(`mentor_signatures`, `/mentor/signature` 본인만 등록·대행 불가)을 자동으로 붙임.
  - **두 정책 모두 적용 양식에 `{{{sign_mentor}}}` 컬럼이 있을 때만 유효**(`resolveRoundReportPolicy` 가 실제 적용값을 계산, 설정 화면은 컬럼이 없으면 토글 비활성, 서버 액션도 거부).

---

## 12. 구현 단계 (검증: `typecheck` · `lint` · `build` · `test` 4종 통과 후 다음 단계)

> P4 구현 메모: `src/lib/settlement/{compute,policy,settle,export,labels,actions}.ts` · `src/lib/workflow/{review,batches,withdrawal}.ts` · `src/lib/data/settlements.ts` · 페이지 `/nextlab/settlements`(+`/batches/[id]`) `/institution/settlements`(+`/[id]`) `/mentor/settlements` · API `/api/nextlab/batches/[id]/export`. 알림 `payload.message` 가 문자 본문 뒤에 붙는다(`dispatch.ts`). T7 은 스냅샷 저장 성공 후에만 상태 전이(반쪽 성공 금지), 상태 경쟁 시 스냅샷 자동 취소.
| 단계 | 내용 | 산출 |
|---|---|---|
| P1 | 마이그레이션 0046~0057 작성 + Supabase `modu` 적용 + `database.ts` 재생성 | 스키마 확정 |
| P2 ✅ | 도메인 코어: 상태 v2·전이 상수·역할 라벨·행사/그룹 컨텍스트(쿠키)·허브·가드 + **레거시 삭제** → 빌드 그린 (2026-09-07) | 뼈대 |
| P3 ✅ | 멘토 흐름: 회차 등록(웹/업로드, 검증 7항목·설정 한도)·사진·관찰의견서·종결 요청·추가 회차 요청·**중도 종료 요청** + **엑셀 일괄 등록**(멘토·멘티) + **멘티 서류 첨부(멘토 공개/비공개)** + **행사별 문자 API(§21)** → 3종 그린 (2026-09-07) | 멘토 완료 |
| P4 ✅ | 정산: `computeSettlement`(기타소득·사업소득·없음, vitest 15건) + 예상/확정 동일 함수, 검수 승인(T6/T7)·확정 취소, 부분 정산(T10/T11a/T11b), 품의(T8/T8'·제출·철회·삭제), 발주처 정산 확인(T9 → closed), 지급 완료, 정산서 PDF(`settlement_statement`), 품의 엑셀, 멘토 통보(금액 포함) → 4종 그린 (2026-09-07) | 정산 완료 |
| P5 ✅ | 멘티: 회차 서명(0057 `signatures.log_id`, 서명 후 멘토 수정 잠금)·만족도 조사(문항 5종 렌더·검증·score 파생, 종결 요청 이후 1회)·멘토 변경 요청(운영사 수락 시 T3)·그룹 필수서류 슬롯(`req:`/`req1:` + 종결 게이트 `require_group_docs`) → 4종 그린 (2026-09-07) | 멘티 완료 |
| P6 ✅ | 운영: 설정 페이지 8탭(§16: 행사 기본·그룹+필수서류·단가한도·정산·종결게이트+서명정책·보고서 양식·만족도·키워드)·요청함·멘티 등록 폼·승계 개설(§8)·멘토 명단(지급서류 재인증 일괄 체크·그룹별 원천징수·운영사 평가 §15·§20)·리포트+대시보드 타일(§19, `reports/metrics.ts` 단일 계산)+엑셀 · **보고서 양식·서명 정책(§22)** → 4종 그린 (2026-09-07) | 운영 완료 |
| P7 ✅ | 플랫폼: `/platform` 콘솔(행사 목록·개설·설정 복제·종료·스태프 발급·플랫폼 관리자 지정)·`/api/setup` 플랫폼 관리자화·브랜딩 잔재 0건(`scripts/check-brand-strings.sh` 를 `npm run lint` 에 편입) · **AI 매칭 추천**(§14: 객관 점수 `matching/score.ts`+vitest, Claude API `claude-opus-5` 구조화 출력 정성 근거, 키 없으면 객관 점수만, 채택 기록) · 멘티/멘토 프로필 편집 → 4종 그린 (2026-09-07) | 다중 행사 |
| P8 | Vercel 생성·환경변수(`SMS_KEK`·`ANTHROPIC_API_KEY`·`BOOTSTRAP_TOKEN` 등)·`/api/setup` 부트스트랩 → `/platform` 첫 행사·역할별 권한 격리 점검·문자 1건·PDF 1건·매칭 1건 | 배포 |

---

## 13. 결정 기록
- 2026-09-08 **행사별 역할(설계 B)**: 한 사람이 A 행사 멘토·B 행사 멘티 가능. `program_members.role` 신설(0059), 세션 가드의 역할 치환, 회원관리 "기존 계정을 이 행사에 추가"·역할 변경·소속 해제, 케이스 등록 시 이메일/휴대폰 일치 계정 자동 연결. 회원관리·문자 수신자·발주처 멘토 현황은 행사 범위로 교정.
- 2026-09-07 사용자 답변 6건 반영. 승인 게이트 = 렛츠 검수 → 센터 정산 확인 2단계로 확정.
- 2026-09-07 관찰의견서 = 평가서, 멘티당 1건 단일본, DB 유니크 인덱스 대상.
- 2026-09-07 단가 온라인 8만/오프라인 10만, 1일 1건 상한 24만/30만, 멘토 1일 3건, 추가 회차 요청 기능.
- 2026-09-07 정산: 종결 승인 시 확정 스냅샷 → 지급 대기 → 품의 묶음 → 센터 확인 → 종결. 주기는 품의 단위(미정 → 운영 재량).
- 2026-09-07 회차 이행(예상) / 회차 완료(확정) 이원화. 계산 함수 단일화 + 단위 테스트(vitest 도입).
- 2026-09-07 사업그룹 A~D 시드, 그룹 동적 생성(enum → text), 그룹 간 승계 = `predecessor_case_id`.
- 2026-09-07 **다중 행사 = 한 배포 안의 `programs` 계층(B안)**, 1계정 1프로그램, 플랫폼 관리자 플래그. 인프라 복제(A안)는 대안으로 문서 유지.
- 2026-09-07 URL `/nextlab` → `/operator` 개명, 역할 키 `nextlab` 은 유지.
- 2026-09-07 **3차 답변 반영**: 원천징수 방식 = 그룹 일괄 + 그룹 내 멘토별 override · 멘토 중도 종료 = 자진(멘토 사유→렛츠 승인) / 강제(렛츠 사유, 운영사·발주처만 열람) · 한도 규칙 = 행사 단위 · 발주처/운영사 리포트 메뉴 + 대시보드 통계 타일·팝업 드릴다운(§19) · 그룹별 멘토 명부의 운영사 평가·메모(그룹 귀속, 멘토별 통합 로그 §20) · **1계정 = 여러 행사·여러 그룹, 통합 로그인 + 허브 배너, 단일 활성 시 자동 진입, 상단에 행사명/그룹명 표시(§18)** — 행사별 로그인 URL(구 §1-6)·1계정 1행사 원칙은 폐기.
- 2026-09-07 **2차 답변 반영**: 원천징수 = 기타소득(실효 8.8%, 파라미터화) · 일일 상한 = 같은 멘티·같은 날 합산 · 정산 단위 = 케이스×멘토(중도 종료 부분 정산, `reassignment_pending` 상태 신설) · 만족도 그룹별 표준양식(문항 유형 5종) · 행사별 로그인 `/{slug}/login` · 한도 전부 설정 페이지 · AI 매칭 추천(객관 점수 + Claude 정성 근거, 자동 배정 없음) · 멘토 지급서류 수령 체크(비밀번호 재인증·일괄).
