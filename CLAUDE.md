# 모두의창업 (modu) — Claude 세션 메모리

> 이 파일은 새 Claude Code 세션이 시작될 때 자동으로 읽힙니다.
> **원본 뼈대**: `dalgme/restart` (재기지원사업 운영관리 플랫폼)에서 복제 — 인프라·인증·문서·알림·PDF·감사 구조를 승계.
> 복제 절차는 `docs/PLATFORM-CLONE-HANDOVER.md`, 개조 지점은 `docs/DOMAIN-REMODEL-GUIDE.md` 참조.
> **기획·구조·전달받은 프롬프트 통합 정리** = `docs/handbook/` (01 기획 · 02 구조 · 03 프롬프트 · `modu-handbook.html`, `python3 scripts/build-handbook.py` 로 재생성).

---

## 0. 이 프로젝트는 무엇인가

- **사업명**: 모두의창업
- **발주·승인**: 세종창조경제혁신센터 (이하 **센터**)
- **운영 총괄**: (주)렛츠
- **한 줄 정의**: 모두의창업 참여 **멘티와 멘토를 1:1로 연결·배정**하고, **멘토링 운영과정(회차·보고서·평가서)을 관리**하는 플랫폼.

### 주체별 목적
| 주체 | 이 시스템에서 얻는 것 |
|---|---|
| 센터 (발주) | 멘토별·멘티별 **실시간 진행현황** 확인 |
| (주)렛츠 (운영 총괄) | 사업그룹 개설, **멘토 배정**, **중간 멘토 변경**, **멘토링 날짜·보고서 등록**, **평가서 등록** 관리 |

---

## 1. 역할 — ✅ 확정 (2026-09-07)

| 역할 키 | 화면 표기 | 인원 | 하는 일 | 원본 대응 |
|---|---|---|---|---|
| `institution` | 세종창조경제혁신센터 | 소수 | 진행현황 열람, 발주·승인 | institution(진흥원) |
| `nextlab` → 리네이밍 예정 | (주)렛츠 | 소수 | 운영 총괄 — 그룹 개설·배정·변경·검수 | nextlab(넥스트랩) |
| `mentor` | 멘토 | **약 80명** | 담당 멘티 컨설팅 4회 수행·보고서 등록 | mentor |
| `mentee` | 멘티 | **약 400명** | 본인 진행현황 열람·서류 제출 | mentee |

- **멘토와 멘티는 별도 선발하여 등록**한다. 셀프 가입 없음 — 운영진이 계정 발급 → 임시 비밀번호 → 최초 로그인 시 변경 강제 (원본 구조 그대로).
- 역할 **4개 그대로** → `user_role` enum 구조 변경 불필요. **라벨과 라우트 그룹명만 교체**하면 된다.
- **역할은 행사별이다 (설계 B, 2026-09-08, 마이그레이션 0059).** `program_members.role` 이 그 행사 안에서의 역할이고 `users.role` 은 기본 역할(행사 밖·새 소속 기본값). 같은 사람이 A 행사 멘토·B 행사 멘티가 될 수 있고 계정은 1개다.
  - 가드 `getRealSessionProfile()`/`getSessionProfile()` 이 컨텍스트 쿠키의 행사에 맞춰 `profile.role` 을 치환하므로(`src/lib/auth/program-role.ts`) 하위 코드는 `profile.role` 만 읽는다. `ctx.role` 도 같은 값.
  - 명단·배정 후보·알림 수신자·매칭 후보는 **`program_members.role` 로 필터**한다. `users.role` 로 사람을 고르지 말 것.
  - 소속 추가는 운영사 회원관리 "기존 계정을 이 행사에 추가"(역할 지정) 또는 플랫폼 콘솔. 케이스 등록 시 이메일·휴대폰이 기존 계정과 일치하면 새 계정 대신 그 계정을 멘티로 연결한다.
  - RLS 헬퍼 `is_staff/is_nextlab/is_institution` 은 "어느 행사에서든 그 역할"(has_role), 행사 범위는 `program_role(pid)`.
  - `src/lib/auth/roles.ts` 의 `ROLE_LABELS`, 라우트 그룹 폴더 `(nextlab)` 등.
  - RLS 헬퍼(`private.is_staff/is_nextlab/is_institution`)는 **이름만 바꾸거나 그대로 둘 것** — 동작은 그대로.

---

## 2. 데이터 모델 — ✅ 원본과 **같은 1:1 구조** (2026-09-07 확정)

**1멘티 = 1멘토 = 1케이스.** 원본 restart 의 케이스 모델이 그대로 맞는다.
→ 이전 초안에 적었던 "그룹당 멘토 1명 : 멘티 N명" 구조는 **오해였다. 폐기.**

```
support_types(= 사업그룹, 3~5개)
  └ cases (멘티 1명 = 1건)
       ├ mentor_assignments (활성 멘토 1명, is_active 로 교체 이력 보존)
       └ mentoring_logs (컨설팅 회차 — 총 4회)
            ├ 보고서 첨부  (doc_key: mentoring_report, 누적)
            └ 관찰의견서(=평가서)  (doc_key: observation_report, 케이스당 1건 단일본 — §4)
```

### 2-1. 사업그룹 = `support_types` 재사용
- 총 **3~5개 사업그룹**을 각각 개설·관리한다.
- 원본의 `support_types`(경영개선/폐업정리) 자리에 사업그룹을 넣는다.
  - `support_type_code` enum 값 교체 (`0002_core_schema.sql` 을 고치지 말고 **새 마이그레이션**으로).
  - `limit_amount` / `calc_method` / `area_unit_price` 는 **금액 지원 개념이 없으면 사용하지 않음** — 컬럼을 지우지 말고 방치하거나, 새 마이그레이션에서 nullable 로 완화.
  - `support_type_documents` 는 **그룹별 필수서류**로 그대로 유용하다.
- ⚠ **`supabase/migrations/0004_seed.sql`(경영개선·폐업정리 시드)은 새 DB에 적용하지 않았다.** 사업그룹이 확정되면 그 값으로 새 시드 마이그레이션을 작성할 것.

### 2-2. 그룹 간 승계 (연속성) — **신규 개발 필요**
일부 사업그룹은 연속성이 있어 **멘티가 다음 단계 사업그룹으로 승계**된다.
- `cases` 에 승계 링크 컬럼 추가: `predecessor_case_id uuid references public.cases(id)`
- 승계 시 **새 case 를 생성**하고(새 사업그룹 소속) 이전 case 를 가리키게 한다. 기존 case 를 다른 그룹으로 옮기지 말 것 — 이전 그룹의 이력·서류가 오염된다.
- 화면: 멘티 상세에 "이전 단계 이력" 링크, 운영 화면에 "승계 대상 선택 → 일괄 개설".

### 2-3. 컨설팅 4회 + 멘토 변경 승계
- **1멘티당 총 4회**, **1명의 멘토**가 담당.
- 회차 수는 `support_types.required_rounds`(그룹별 3~4) + 승인된 추가 회차. `logRequirement()` 하드코딩은 제거.
- **중간 멘토 변경 시 잔여 회차 승계**: `mentor_assignments` 가 이미 `is_active` 로 교체 이력을 남기므로 **테이블 변경 불필요**.
  - 회차 카운트는 **케이스 단위 누적**(`mentoring_logs` 전체)으로 세야 한다. 멘토별로 세면 변경 후 회차가 리셋된다. ← 개조 시 반드시 확인할 지점.
  - `mentoring_logs` 에 `mentor_id` 를 남겨 "몇 회차를 누가 했는지" 추적 가능하게 할 것.

### 2-4. 컨설팅 유형별 단가 · 멘토 정산(지급청구) — ✅ 요건 확정 (2026-09-07) · **신규 개발**

- **멘토 1명은 여러 멘티를 담당**한다. (멘티 쪽에서 보면 여전히 1:1 — `cases` 모델 그대로. 구조 변경 없음.)
- 한 멘토가 **단가가 다른 유형을 섞어서** 진행한다. 예: 온라인 컨설팅 / 오프라인 컨설팅.
- **지급청구서는 별도 서식으로 작성하지 않는다.** 시스템이 **자동 집계**해 결산 정보를 만들고 **푸시**한다.

**필요한 것**
1. **컨설팅 유형 + 단가 테이블** — 예: `consulting_rates(support_type_id, mode, unit_price, effective_from)`
   - `mode` ∈ `online` / `offline` (+ 추가 가능). 단가는 **사업그룹별로 다를 수 있으니** 그룹 축을 반드시 넣을 것.
   - **단가는 이력 관리(`effective_from`)** — 중간에 단가가 바뀌어도 과거 정산이 소급 변조되면 안 된다.
2. **회차 기록에 유형 부착** — `mentoring_logs.mode` + **집계 시점의 단가를 스냅샷으로 저장**(`unit_price_snapshot`).
   단가 테이블을 조인해서 매번 재계산하면 과거 정산액이 흔들린다. ← 가장 중요한 설계 포인트.
3. **정산 집계** — 멘토 × 기간(월/차수) 단위로 `mentoring_logs` 를 집계.
   `건수 × 단가` 합계 + 유형별 내역(온라인 N건, 오프라인 M건).
   - 집계 대상은 **완료 인정된 회차만**(보고서 등록 완료 등 — 인정 기준을 §3 상태머신과 함께 확정할 것).
4. **결산 확정 + 푸시** — 집계 결과를 `settlements` 로 **확정 저장(스냅샷)** 하고,
   멘토에게 인앱 알림 + 문자(`queueNotification`, 원본 알림 인프라 그대로 재사용)로 통보.
   - 확정 후 회차가 추가/수정되면 **다음 회차 정산에 반영**하고 확정본은 건드리지 말 것.

> ⚠ **금액이 걸린 기능**이다. 집계 로직은 반드시 단위 테스트를 붙이고,
> 화면 표시액과 확정 저장액이 같은 함수에서 나오게 할 것(두 군데서 각자 계산하면 반드시 어긋난다).

**확정된 수치 (2026-09-07 답변 3·4·5)** — 상세 `docs/MODU-DESIGN.md §6`
- 온라인 **80,000원/회**, 오프라인 **100,000원/회**. 1일 1건(멘티)당 상한 온라인 240,000 / 오프라인 300,000. 멘토 1일 최대 3건.
- 정산 단위 = **케이스(멘티) 종결 검수 승인 시 확정 스냅샷**(`settlements`: 유형별 회차·단가·합계·원천징수·실지급요청액) → `settlement_pending` → 렛츠가 골라 **지급 품의**(`settlement_batches`) → 센터 확인 → `closed`.
- 정산 주기는 미정 → 품의 묶음 단위로 운영 재량. **원천징수는 기타소득세 일괄**(필요경비 60% · 세율 20% · 지방세 10% → 실효 8.8%, 파라미터는 프로그램 설정, 스냅샷에 적용값 저장).
- **정산 단위 = 케이스 × 멘토**(`settlements` unique(case_id, mentor_id), kind `closure`/`partial`). 멘토·멘티 중도 종료 시 이행 회차는 `partial` 정산. 멘토 중도 종료는 멘토가 사유 작성 → 렛츠 승인 → `reassignment_pending` → 타 멘토 배정해 잔여 회차 진행.
- **1일 상한은 같은 멘티·같은 날 합산**(회차 수 ≤ 3, 유형별 금액 ≤ 24만/30만). 단가·한도·회차 수는 전부 **운영 설정 페이지**(`operating_limits`·`consulting_rates`, 그룹별 override, 적용일 이력) — 코드에 숫자 금지.
- 계산 함수 `src/lib/settlement/compute.ts` **단 한 곳** + `vitest` 단위 테스트(검증 4종째).

### 2-6. 추가 확정 기능 (2026-09-07 2차 답변) — 상세 `docs/MODU-DESIGN.md §14~§16`
- **행사별 로그인** `/{slug}/login`(브랜딩·계정 소속 검증), 플랫폼 관리자만 `/platform/login` 통합 로그인.
- **만족도 조사 표준양식**: 그룹별 템플릿 + 문항 유형 5종(척도·단일·복수·주관식·순위), 응답 생기면 잠금·새 버전.
- **AI 멘토 매칭 추천**: 멘토·멘티 다중 키워드 프로필 → 코드 객관 점수(태그 겹침·지역·유형·부하) → Claude API 정성 근거 → `match_recommendations` 에 근거 저장. **자동 배정 없음**, 배정은 렛츠 클릭.
- **멘토 지급서류 수령 체크**(이력서·통장사본·신분증사본): 멘토 명단에서 체크, **비밀번호 재인증** 필수, 다중 멘토 일괄 입력, 파일은 보관하지 않음.
- 종결 게이트(멘티 서명·필수서류) 기본 **꺼짐**, 설정으로 켬.

**원본에서 재사용 가능한 것**: 알림 큐 + Cron 디스패치, `reviews`(종결 검수 기록), PDF 렌더(`render.ts`), 서명 캔버스.
`payment_applications`·`calc_method`·`limit_amount` 는 **재사용하지 않고 삭제**.

---

## 2-5. 다중 행사(프로그램) 구조 — ✅ 확정 (2026-09-07) · **신규 개발**

이 운영방식을 **계정 추가만으로 여러 행사에 복제**할 수 있어야 한다. 상세는 `docs/MODU-DESIGN.md §1`.
- 최상위에 `programs`(행사) 테이블. **계정·사업그룹·케이스·단가·브랜딩 라벨이 전부 프로그램 소속.**
- **1계정 = 1프로그램** (`users.program_id`). 두 행사를 맡으면 계정 2개. 멤버십 다대다 테이블 없음.
- 플랫폼 관리자는 `users.is_platform_admin` 플래그(역할 enum 추가 없음) — `/platform/*` 콘솔에서 행사 개설·첫 계정 발급·복제.
- 격리는 두 겹: RLS `private.program_id()` + 서비스롤 경로의 모든 스태프 조회·알림 수신자 조회에 `program_id` 코드 필터.
- **발주처·용역사(운영) 기관명은 행사 기본 설정에서 등록 → 그 행사의 모든 화면·문서·알림에 반영**(`docs/MODU-DESIGN.md §17`). 코드에 기관명 리터럴 금지, `getBranding()`/`roleLabel()`/`fmt('{client}…')` 로만 읽는다. `scripts/check-brand-strings.sh` 로 lint 단계에서 0건 강제.

---

## 3. 진행 단계(상태머신) — ✅ 확정 (2026-09-07)

`case_status` enum 을 **전면 교체**(새 DB 이므로 타입 재생성). 상세 전이 표는 `docs/MODU-DESIGN.md §3-2`.
```
registered(멘티 등록) → mentor_assigned(멘토 배정) → in_progress(컨설팅 진행 중, 1회차 등록 시)
       ↔ reassignment_pending(멘토 중도 종료 승인 → 재배정 대기 → 배정되면 in_progress 복귀)
  → closure_requested(관찰의견서 제출·종결 요청 — 멘토)
       ↔ revision_requested(렛츠 보완요청)
  → settlement_pending(렛츠 검수 승인 + 정산 확정 = 지급 대기)
  → settlement_batched(지급 품의 편성 — 렛츠)
  → closed(센터 '정산 확인' = 종결 확정)
  ※ withdrawn(중도 종료) 은 어느 비종결 상태에서든
```
- 승인 게이트는 **2단계**: 렛츠 검수(정산 확정) → 센터 정산 확인. 원본의 지급/승인 9개 상태·전이 10개는 제거.
- `contacted`(멘티 연락) 단계 제거.
- 전이 상수는 `src/lib/workflow/transitions.ts` 한 곳에 두고 **UI 버튼 조건과 서버 게이트가 같은 상수를 읽는다.**
- **⚠ 불변 규칙**: 화면 버튼의 활성 조건과 서버 액션의 상태 게이트는 **반드시 같이** 수정한다.
  어긋나면 "버튼은 눌리는데 실패"가 난다 (원본에서 실제 발생한 버그).

### 3-1. 회차 규칙 (답변 3·5 · **P12 2단계 개정 2026-09-08**)
- 1회차 = `mentoring_logs` 1행. **등록은 2단계**: ① **1단계 계획/실행**(사전·사후 모두 가능) = 일자·시작/종료 시각(24시간제 10분 단위)·운영시간 자동계산·방법(온/오프)·**참가자(멘티 개인/팀 대표/팀원/복수 구성원, `participants` jsonb 스냅샷)**·장소 — 장소 외 전부 클릭 선택, 통계·정산 기본데이터 ② **2단계 실서류(보고서)** = 웹작성 또는 파일 + 사진 (`report_registered_at` 기록, 진행 전(미래) 회차는 불가).
- **회차 이행 = 보고서(2단계)까지 등록된 회차**. 정산(`loadUnsettledRounds`)·종결 요청·멘티 서명은 전부 `report_registered_at is not null` 게이트. 계획만 등록된 회차는 정산에 포함되지 않는다.
- **회차 완료** = 케이스가 `settlement_pending` 이상(확정). 회차 행에 별도 상태 컬럼 없음(계획/이행은 `report_registered_at` 로 구분).
- 멘티는 개인 또는 팀 — 팀원 명단은 `case_team_members`(운영사 케이스 상세 [팀 정보]에서 관리), 회차 참가자는 등록 시점 스냅샷이라 명단 변경에 영향받지 않는다.
- 검증(서버 코드에서 직접): 회차 ≤ `support_types.required_rounds` + 승인된 추가 회차 / **같은 멘티·같은 날·같은 유형 합산 ≤ 일일 상한**(온 24만·오프 30만) / **멘토 1일 최대 3건(멘티)** / 시간 겹침 불가 / 단가 스냅샷 필수.
- 추가 회차는 `round_extension_requests`(멘토 요청 → 렛츠 승인).

---

## 4. 서류 체계 (doc_key) — ✅ 확정 (2026-09-07)

| doc_key | 이름 | 성격 | 강제 |
|---|---|---|---|
| `mentoring_report:{logId}` | 회차 보고서(업로드본) | 누적(회차당 1) | 유니크 인덱스 접두 |
| `mentoring_photo:{logId}` | 회차 사진 | 누적 | 없음 |
| `observation_report` | **관찰의견서(= 평가서)** — 멘티당 1건, 담당 멘토 작성 | **단일본** | **DB 유니크 인덱스** + 앱 delete-then-insert |
| `settlement_statement` | 정산서(확정 시 생성) | 이력보존 | 없음(의도) |
| `req:{key}` / `req1:{key}` | 그룹별 필수서류(`support_type_documents`) | 그룹 설정 | `req1:` 접두는 유니크 |
| `application_pdf` | 등록 원본 | 이력보존 | 없음 |
| `case_doc` | 멘티 관련 서류(자유 첨부) — `documents.mentor_visible` 로 멘토 공개/비공개 | 누적 | RLS + 코드 필터 |

- 0045 인덱스는 **새 마이그레이션으로 교체**(`observation_report` 등 새 키). 원본 키(`consulting_report`/`support_application`/`form_*`/`contractor_*`/`si:`/`post:`/`payment_*`)와 관련 테이블(`contractors` `support_applications` `payment_applications` `approvals`)은 삭제.
- 업로드 UI 는 `CaseDocUpload` 재사용. 상세 카탈로그는 `docs/MODU-DESIGN.md §5`.

---

## 5. 기술 스택 (원본 승계)

Next.js 14.2 App Router / TypeScript / Supabase(Postgres·Auth·Storage·RLS) /
Tailwind + shadcn(Radix) / react-hook-form + zod / playwright-core + @sparticuz/chromium(PDF) /
pdf-lib(병합) / Solapi(SMS) / nodemailer(이메일) / Vercel(icn1)

---

## 6. 반드시 지킬 규칙 (원본에서 사고가 났던 지점)

1. **신원 분리** — 스태프 특권·감사 실행자는 `getRealSessionProfile()`, 업무 명의는 `getSessionProfile()`.
   대행(view-as) 중 이 둘이 달라진다.
2. **RLS를 범위 강제에 쓰지 말 것** — service_role 경로에서는 RLS가 적용되지 않고,
   대행 중에는 `auth.uid()`가 실행자라 범위가 넓어진다. 배정 확인은 **코드에서 직접**.
3. **`audit_logs`는 `actor_id = auth.uid()` 강제** — 남의 명의로 남기려면 service_role 경로.
   아니면 **조용히 유실**된다. insert 에러를 절대 삼키지 말 것.
4. **PDF 라우트는 `export const maxDuration = 60`** — 서버리스 Chromium 콜드스타트.
5. **문자 발송은 try/catch로 격리** — 문자 실패가 본 작업을 막으면 안 된다.
6. **`NEXT_PUBLIC_*` 변경 시 빌드 캐시 없이 재배포.**
7. **서버 액션에서 역할 불일치 시 `redirect()` 금지** — 페이지 전체가 튕긴다. `{ ok:false, error }` 반환.
8. **단일본 doc_key는 DB 유니크 인덱스로 강제** — 앱 코드만 믿으면 중복이 쌓인다(원본에서 5건까지 쌓인 사고).
9. **회차 카운트는 케이스 단위** — 멘토 변경 시 리셋되면 안 된다(§2-3).

---

## 7. 개조 순서

```
1) ✅ 역할 확정 (§1)
2) ✅ 데이터 모델 확정 (§2) + 다중 행사 구조 (§2-5)
3) ✅ 단계 확정 (§3)
4) ✅ 서류 목록 확정 (§4)
5) ✅ 현행 코드 전수 조사 (docs/CURRENT-STATE.md) · 설계 (docs/MODU-DESIGN.md)
6) ✅ P1 마이그레이션 0046~0055 + 시드 + database.ts 재생성 (2026-09-07)
7) ✅ P2 도메인 코어(상태 v2·전이 상수·행사/그룹 컨텍스트·허브·가드) + 레거시 삭제 → **typecheck·lint·build 그린** (2026-09-07)
8) ✅ P3 멘토 흐름(회차·관찰의견서·종결·추가 회차·중도 종료 요청) + 엑셀 일괄 등록 + 멘티 서류(멘토 공개/비공개) + 행사별 문자 API 7겹 보안 (2026-09-07)
9) ✅ P4 정산(compute 단일 함수 + vitest 15건 · 검수 승인/보완 · 부분 정산 · 품의 · 발주처 확인 · 정산서 PDF · 엑셀) (2026-09-07)
10) ✅ P5 멘티 기능(회차 서명·만족도 조사·멘토 변경 요청·그룹 필수서류) (2026-09-07)
11) ✅ P6 운영 설정 8탭·요청함·멘티 등록·승계 개설·멘토 명단(지급서류·원천징수·평가)·리포트+대시보드 타일·보고서 양식+서명 정책 (2026-09-07)
12) ✅ P7 플랫폼 콘솔·/api/setup 플랫폼 관리자화·브랜딩 잔재 0건·AI 매칭 추천 (2026-09-07)
13) ✅ P8 배포 (2026-09-08) — Vercel `modu` 생성·환경변수·배포 보호 해제·`/api/setup` 부트스트랩·플랫폼 관리자 로그인까지 완료. 운영 URL `https://modu-dalgmes-projects.vercel.app` (작업 브랜치가 Production). 남은 것: 런북 §4 기능 검증 → 도메인 연결 → main 머지
```

> 단계별 상세와 파일 변경 지도는 `docs/MODU-DESIGN.md §10·§12`. 설계에 열린 항목 9건은 §11.

---

## 8. 브랜딩 치환 대상 (원본 잔재)

```bash
npm run lint:brand   # scripts/check-brand-strings.sh — 0건 (npm run lint 에 포함, 2026-09-07 달성)
```
전수 치환 완료(0건). DB 쪽 잔재도 확인: `app_settings.mentor_weekly_reminder_template`.
치환의 목적지는 "세종/렛츠" 리터럴이 **아니라** `programs` 의 발주처·용역사 필드다(§2-5). 새 문구를 쓸 때도 `{client}` `{operator}` `{program}` 플레이스홀더만 허용.

---

## 9. 인프라 현황

| 항목 | 상태 |
|---|---|
| GitHub | `dalgme/modu` — 코드 푸시 완료 |
| Supabase | 프로젝트 `modu` (`osrigknfrzsqjrgihgao`, ap-northeast-2) — 원본 구조(0001~0045 선별) + **모두의창업 P1 마이그레이션 0046~0055 적용 완료 (41개 테이블, 2026-09-07)**. `src/types/database.ts` 재생성 완료 |
| Vercel | 프로젝트 `modu`(`prj_fdR6ekkXRDiQ8T6Uui3AUV4NKtuL`, 팀 `dalgmes-projects`, icn1) — `dalgme/modu` 연결, **Production = `claude/modu-platform-audit-tutute`**, URL `https://modu-dalgmes-projects.vercel.app`. 환경변수 입력·배포 보호(Vercel Authentication) 해제 완료 (2026-09-08). 절차는 `docs/DEPLOY-RUNBOOK.md` |
| 환경변수 추가 | `SMS_KEK`(행사별 문자 API 암호화 키, `openssl rand -hex 32`) — Vercel 에 반드시 설정 · `ANTHROPIC_API_KEY`(AI 매칭 정성 근거, 선택) |
| 초기 계정 | `/api/setup` 부트스트랩 **실행 완료 (2026-09-08)** — 플랫폼 관리자 1명(nextlab + is_platform_admin, 시드 행사 멤버십), 비밀번호 변경 완료. 이후 재호출은 409. `BOOTSTRAP_TOKEN` 은 Vercel 에서 삭제할 것 |

> Supabase 키는 코드에 없다(`.env.example` 만 존재, 전부 환경변수). `modu` 프로젝트는 `restart`(`thgdodvxhxukvwqpzbyi`)와 **별개 프로젝트**이므로 Vercel 에 `modu` 의 URL·anon·service_role 키를 넣으면 단독 운영된다. 원본 `.env` 값을 복사하지 말 것.

### 적용된 마이그레이션 / 의도적으로 건너뛴 것
- **적용**: 0001 스토리지 / 0002 코어 스키마 / 0003 RLS / 0005 헬퍼 강화 / 필드추가(0009·0017·0035·0038·0030) / 0014·0041 상태값 / 0028 문의 / 0031 OTP / 0032 FAQ(표 구조만) / 0034 운영요청 / 0036 게시판 / 0037 문자예약·설정 / 0039 보완요청 / 0044 임시수정권한 / 0045 단일본 인덱스
- **건너뜀 — 재기지원 전용 데이터**: 0004(지원유형 시드), 서식 21종(0006·0007·0008·0010~0013·0015·0016·0018~0027·0029·0040 · 약 221KB PDF 서식), 0032 FAQ 시드 4건, 0033·0042·0043(기존 운영데이터 정정 — 새 DB 에선 무의미)
- → **모두의창업 서식·시드는 새로 작성해야 한다.**
- **P1 적용(2026-09-07)**: 0046 programs·멤버십·플랫폼관리자 / 0047 support_types v2·그룹 명부 / 0048 case_status v2·cases 정리·배정 종료 사유·자진 종료 요청 / 0049 consulting_mode·단가·한도·mentoring_logs v2·추가회차 요청 / 0050 settlements·품의 / 0051 멘토변경 요청·만족도 양식·멘토 그룹 평가·reviews 재사용 / 0052 단일본 인덱스 v2 / 0053 레거시 5테이블 삭제·app_settings·서식·알림·감사 행사 범위 / 0054 매칭 프로필·추천·멘토 지급서류 / 0055 모두의창업 시드(행사·그룹 A~D·단가·한도·만족도 양식·키워드).
- **P2 완료(2026-09-07)**: 레거시(보조금 절차) 151개 파일 삭제, 도메인 코어 신설 — `src/types/case-status.ts`(v2) · `src/lib/workflow/transitions.ts`(전이 상수, UI·서버 공용) · `src/lib/programs/{branding,data,context,enter,actions}.ts`(브랜딩·멤버십·컨텍스트 쿠키·허브 진입) · `/hub`(행사/그룹 배너·자동 진입) · `AppHeader` 컨텍스트 바 · 역할 레이아웃 `requireContext()` · `workflow/cases.ts`(등록·배정·교체·회수 v2) · 대시보드·케이스 상세(얇은 뼈대). typecheck·lint·build 그린.
- **P3 완료(2026-09-07)**: 0056 적용. `src/lib/workflow/{rounds,closure,mentor-actions,case-documents,document-actions}.ts` · `src/lib/data/rounds.ts` · `src/lib/settlement/rates.ts`(단가·한도 이력 해석) · `src/lib/import/`(엑셀 일괄 등록, xlsx) · `src/lib/sms/`(행사별 문자 API 봉투암호화·재인증, `docs/MODU-DESIGN.md §21`, 환경변수 `SMS_KEK`) · 페이지 `/mentor/cases/[id]`(회차·관찰의견서·요청·서류) `/mentee/documents` `/nextlab/members/import` `/nextlab/settings/sms-api`. 3종 그린.
- **P4 완료(2026-09-07)**: `src/lib/settlement/{compute,policy,settle,export,labels,actions}.ts` · `src/lib/workflow/{review,batches,withdrawal}.ts` · `src/lib/data/settlements.ts` · 페이지 `/nextlab/settlements`(품의 편성·제출·지급완료) `/institution/settlements`(정산 확인 T9) `/mentor/settlements` · 케이스 상세에 검수 패널·확정 정산 카드·중도 종료 패널. `npm run test`(vitest) 검증 4종째 편입. 4종 그린.
- **P5 완료(2026-09-07)**: 0057 적용. `src/lib/workflow/{mentee,mentee-actions}.ts` · `src/lib/data/{survey,mentee}.ts` · `case-documents.ts` 필수서류 슬롯(`listRequiredDocSlots`·`missingRequiredMenteeDocs`) · 페이지 `/mentee/rounds`(서명) `/mentee/survey` `/mentee/documents`(필수서류+자유첨부) · 대시보드 할 일 카드 · 운영사 케이스 상세에 멘토 변경 요청 처리·만족도 응답·필수서류 패널. 4종 그린.
- **P6 완료(2026-09-07)**: 0058 적용. `src/lib/settings/{data,actions}.ts` + `src/components/settings/*`(`/nextlab/settings` 8탭) · `src/lib/documents/round-report.ts`(양식 해석·PDF 재생성·서명 정책, `docs/MODU-DESIGN.md §22`) · `src/lib/data/requests.ts`+`/nextlab/requests` · `/nextlab/cases/new` · `src/lib/workflow/succession.ts`+`/nextlab/succession` · `src/lib/data/mentors.ts`+`src/lib/mentors/actions.ts`+`/nextlab/mentors` · `src/lib/reports/{metrics,export,page-data}.ts`+`/nextlab/reports`·`/institution/reports`·대시보드 타일 · `/mentor/signature`. 4종 그린.
- **P7 완료(2026-09-07)**: `src/lib/platform/{data,actions}.ts`+`/platform`(`(platform)` 레이아웃, `requirePlatformAdmin`) · `/api/setup`·`scripts/bootstrap-admin.mjs` = 첫 플랫폼 관리자(nextlab+is_platform_admin, 시드 행사 멤버십 자동) · `scripts/check-brand-strings.sh`(lint 편입, 0건) · `src/lib/matching/{score,recommend,actions}.ts`+`src/components/matching/*`(`@anthropic-ai/sdk`, 환경변수 `ANTHROPIC_API_KEY` 선택) · `/mentor/profile`. 4종 그린.
- **0059 적용(2026-09-08)**: 행사별 역할 — `program_members.role`(users.role 백필, insert 트리거 기본값), RLS 헬퍼 `has_role`·`program_role`, `is_staff/is_nextlab/is_institution/is_program_staff/is_program_nextlab` 재정의.
- **P8 코드 준비(2026-09-07)**: `next.config.mjs` `outputFileTracingIncludes` 를 실제 PDF 생성 라우트 5개(`/mentor/cases/[id]` `/mentee/rounds` `/nextlab/cases/[id]` `/nextlab/requests` `/institution/cases/[id]`)로 정리(구 `/apply` 제거), `/mentee/rounds`·`/nextlab/requests` 에 `maxDuration = 60`. Supabase 보안 어드바이저 INFO 2건(서비스롤 전용 테이블, 의도)뿐. 4종 그린.
- **P9 완료(2026-09-08)**: 0060 적용(직위·행사별 등급/담당·플랫폼 owner·staff_permissions·report_snapshots·플랫폼 관리자 소속 차단 트리거). ① 플랫폼 콘솔 행사 개설정보 수정(관리코드 `p{연도}-{순번}` 자동 부여, 슬러그 입력 폐지) ② **플랫폼 관리자 = 통합관리 전용 계정**(행사·그룹 소속 불가 — DB 트리거, 허브 진입 없음), owner(`platform_role`)만 부관리자 지정·해제, 부관리자는 소속·역할 무관, 전용 계정 발급 ③ 감사로그 = 사람 언어 설명(`src/lib/audit/describe.ts`) + [소스] 팝업(`AuditTable`), 행사 감사로그는 행사 범위 ④ **운영사 담당 등급** PL/PM/부PM/옵저버(`program_members.grade`) + 권한표(`src/lib/auth/capabilities.ts`, 행사별 override = `programs.staff_permissions`, 설정 8+1탭 '담당 권한') — 모든 운영사 서버 액션에 `denyUnless(ctx, key)`, 옵저버는 열람+리포트만(상단 배너) ⑤ 직위(`users.position`, 발주처·운영사 필수)·행사 담당역할(`program_members.duty`)·그룹 담당역할(`support_type_members.duty`) ⑥ **종합결과리포트**(`report_snapshots` 생성일 고정 스냅샷, `src/lib/reports/{summary,summary-export}.ts`, `/nextlab/reports/summary`, `/api/reports/summary/[id]/export` — html·pdf·docx·xlsx·pptx, 의존성 `docx`·`pptxgenjs`).
- **P10 완료(2026-09-08)**: 0061 조사 캠페인 — `survey_campaigns`·`survey_campaign_targets`(대상자 생성 시점 스냅샷 + 개인 토큰). 운영사가 여러 [조사](만족도·사전선호도·중간 등)를 행사 전체/그룹/개별 구성원 대상으로 기간을 정해 개설(`/nextlab/surveys`, 내비 '조사' 탭, 권한 키 `surveys`). 응답은 플랫폼 내 할 일 카드(멘티·멘토 대시보드)와 문자 링크(`/s/{token}`, 로그인 불필요) 공용 — 채널 기록, 미참여자 항상 파악. 상세 화면 = 실시간 분석(응답률·경로·문항 5종별 집계) + 대상자 표 + 초대/미참여 독려 문자(행사별 문자 API → 플랫폼 폴백, `notify_count` 기록). 종결 만족도(케이스 자동 조사)도 같은 화면에서 실시간 분석 + 미응답 멘티 일괄 독려. 검증·집계는 `src/lib/surveys/validate.ts` 한 곳.
- **P11 완료(2026-09-08)**: 0062 적용(`users.organization` 소속 + `roster_columns`/`roster_values` 임의 컬럼). **명단 우선 등록 운영 흐름** — ① 운영사가 이름/이메일/연락처/소속/직위로 멘티·멘토 리스트 우선 등록(발급 폼·엑셀 일괄 등록에 소속·직위 컬럼) ② 회원관리에서 선택 회원에게 **로그인 안내 문자 일괄 발송**(`sendLoginGuideAction`, 행사별 문자 API→플랫폼 폴백, `{name}` 치환, 발송 이력 audit `sms.login_guide` 로 명단에 표시) ③ **멘토 = Pool 등록(미확정)**, 배정된 멘티 수>0 이면 그 멘티에 대해 "확정" — 회원관리·멘토 명단에 Pool/확정 배지(스키마 변경 없음, `mentor_assignments` 가 원본) ④ 회원 정보 수정 확장(`updateMemberDetailsAction`: 이름·휴대폰·이메일(auth 동기화)·소속·직위·등급·담당역할, 확장 편집 패널) ⑤ **임의 컬럼**: 멘티/멘토 리스트별 최대 8개 컬럼을 운영사가 정의(`roster_columns`), 회원별 값(`roster_values`)을 셀에서 인라인 편집 — 카테고리 마크 용도.
- **P12 완료(2026-09-08)**: 0063 적용(`case_team_members` 팀원, `mentoring_logs.participants`+`report_registered_at`(기존 행 created_at 백필), `mentee_profiles.item_description`). **회차 2단계 분리** — 1단계 계획/실행(`submitRound`: 미래 60일까지 사전 등록 허용, 참가자 필수, 클릭형 UI `round-form.tsx`) / 2단계 보고서(`registerRoundReport`+`round-report-form.tsx`, 진행 전 회차 불가, 멘티 서명 알림은 이 시점). 게이트 3곳: 종결 요청(전 회차 보고서 필수)·멘티 서명(`signRound`)·정산(`loadUnsettledRounds` 필터 — 예상/확정 동일). 팀 정보 패널(`team-panel.tsx`, 아이템명·아이템설명·팀원 CRUD, `team-actions.ts` `case.manage` 게이트) + 보고서 PDF 양식에 `participants` 필드.
- **P13 완료(2026-09-09)**: 0064 적용(`mentor_form_settings`·`mentor_form_submissions`). **책임멘토 위촉 서식 4종**(공고문 붙임2: 위촉 동의서 · 개인정보 수집·이용 동의서 · 서약서 · 사전 확인서, form_key `appointment/privacy/pledge/precheck`). 표준 양식 정의 = `src/lib/mentor-forms/defs.ts`(제목·본문 기본값은 {program}/{client} 플레이스홀더 — 기관명 리터럴 금지 준수, 문항·인적사항 구조는 코드 고정). ① 운영사 설정 `/nextlab/settings?tab=mentor-forms`: 행사별 **사용 여부 체크 + 수령 방식(웹 작성/파일 첨부) + 제목·본문 편집·기본값 복원**(denyUnless `settings`) ② 멘토 `/mentor/forms`(내비 '위촉 서류' + 대시보드 미제출 배너): 웹 작성(위촉 동의서 = 인적사항+주민등록번호, 개인정보 = 3항 동의 라디오, 서약 = 확인 체크, 사전확인 = 3문항 해당없음/있음+세부) 또는 파일 업로드(`mentor-forms/{programId}/{userId}/` 경로), 성명 전자서명, 1인 1건(unique) ③ **집계현황** = 멘토 명단 상단 `MentorFormsStatus` 카드(서식별 제출 n/대상 m 배지 + 미제출 명단 + 웹 응답 다이얼로그·파일 다운로드 + 반려(denyUnless `mentors.docs`, 재제출 허용)). **주민등록번호는 answers 에 넣지 않고 `rrn_sealed`**(SMS_KEK 에서 HMAC 파생한 전용 키로 AES-GCM 봉투암호화, `src/lib/mentor-forms/data.ts`) — 원문 표시는 `members.sensitive` 권한자 한정, 그 외 마스킹.
- **P14 완료(2026-09-09)**: 0065 적용(`mentor_form_settings.support_type_id`·`template_path/name`, 유니크 = 표현식 인덱스(program, coalesce(group), form_key) — **onConflict upsert 불가, 수동 select→update/insert**). **위촉 서식 그룹별 셋팅** — 설정 탭에 [행사 공통 + 사업그룹] 스코프 필 탭, 그룹에서 저장하면 그룹 전용 override(그룹 행 존재 = enabled=false 도 명시적 off), [그룹 설정 해제]로 공통 복귀. 멘토 유효 설정 해석 = **소속 그룹 override(그룹명순 첫째) → 행사 공통 → 미사용**(`resolveEffectiveSettings`/`effectiveSettingForMentor` — 제출 가드·멘토 화면·집계 전부 이 해석). **업로드(파일 첨부) 방식은 표준양식 파일 등록**(`saveMentorFormTemplateAction`, documents 버킷 `mentor-form-templates/{programId}/{groupId|common}/`) → 멘토 화면에 ①양식 다운로드(서명 URL) ②작성 파일 업로드 2단계 안내. 집계현황 대상 = 유효 설정이 사용인 멘토(그룹별 방식이 갈리면 '그룹별 상이' 표기).
- **P15 완료(2026-09-09)**: 0066 적용(`programs.features` jsonb). **행사별 플랫폼 기능 플래그** — `src/lib/platform/features.ts`(FEATURE_KEYS, `featureEnabled()`), 현재 키 `mentor_forms`(위촉 서식 4종). **기본 비활성**(키 없음/false = off): 주민등록번호 보관 등 개인정보 보완 전까지 운영사 설정 [위촉 서식] 탭·멘토 [위촉 서류] 내비/페이지/대시보드 배너·멘토 명단 집계 카드가 전부 숨겨지고, 서버 액션(설정 저장·표준양식 업로드·제출·반려)도 차단(`FEATURE_OFF_ERROR`). 활성 전환은 **플랫폼 통합관리자만** `/platform/programs/[id]` [기능 활성화] 섹션(`setProgramFeatureAction`, audit `program.feature`)에서. 저장된 서식 설정·제출 데이터는 비활성 중에도 유지된다. 새 플랫폼 기능은 이 플래그 체계에 키만 추가하면 같은 방식으로 잠글 수 있다.
- 남은 것: 알림 이벤트별 on/off 설정, 레거시 `/admin/settings/features`(붙임서식 토글) 정리 — P8 이후. **위촉 서식 주민등록번호 보완**(웹 수집 제거·별도 수령 체크 전환 검토) 후 통합관리자가 `mentor_forms` 활성화.

---

## 10. 작업 브랜치 / 배포

- 현재 작업 브랜치: `claude/modu-platform-audit-tutute` (P1~P2 커밋). main 머지는 P8 배포 검증 후.
- 행사/그룹 컨텍스트는 서명 쿠키 `modu_ctx`(`src/lib/programs/context.ts`) — 모든 스태프 조회는 `ctx.programId`(+`supportTypeId`) 로 필터한다. 새 페이지를 만들 때 `requireContext(profile)` 를 빠뜨리지 말 것.
- 배포: main 머지 → Vercel 자동 배포
- 검증 4종: `npm run typecheck` · `npm run lint`(ESLint + 브랜딩 잔재 검사) · `npm run build` · `npm run test`(vitest: 정산 계산·매칭 점수) — 모두 통과해야 머지

---

## 11. 결정 기록

> 결정이 바뀌면 덮어쓰지 말고 날짜와 함께 추가.

- 2026-09-03 원본 `dalgme/restart` (커밋 `5ca3db0`) 에서 복제. 슬러그 `modu`.
- 2026-09-07 **역할 4개 확정** — 센터(institution) / (주)렛츠(운영총괄) / 멘토 약 80명 / 멘티 약 400명. 멘토·멘티 별도 선발 등록.
- 2026-09-07 **1멘티 : 1멘토 확정** → 원본의 case 1:1 모델 그대로 사용. (초안의 그룹 N:1 구조는 폐기)
- 2026-09-07 **사업그룹 3~5개** = `support_types` 에 매핑. 그룹 간 **멘티 승계** 필요 → `cases.predecessor_case_id` 신설 예정.
- 2026-09-07 **컨설팅 총 4회 / 멘토 1명 담당**, 중간 멘토 변경 시 **잔여 회차 승계** — `mentor_assignments.is_active` 로 처리, 회차는 케이스 단위 누적.
- 2026-09-07 Supabase 프로젝트 생성 + 구조 마이그레이션 적용 완료. 재기지원 전용 서식·시드는 제외.
- 2026-09-07 **멘토 1명 : 멘티 다수** 담당 확인 — 멘티 기준 1:1 은 유지되므로 case 모델 변경 없음.
- 2026-09-07 **컨설팅 유형별 단가 차등**(온라인/오프라인 등) + **지급청구서 자동 집계·결산 푸시** 요건 추가(§2-4). 별도 서식 작성 없음.
- 2026-09-07 이 프로젝트는 **재기지원 플랫폼 세션에서 분리**한다. 이후 작업은 modu 전용 Claude Code 창에서 진행.
- 2026-09-07 현행 코드 전수 조사 완료 → `docs/CURRENT-STATE.md`. 사용자 답변 6건 수령.
- 2026-09-07 **상태머신 v2 확정**(§3): 렛츠 검수 → 센터 정산 확인 2단계 게이트. `contacted`·지급 9개 상태 제거.
- 2026-09-07 **평가서 = 관찰의견서**, 멘티당 1건 **단일본**(`observation_report`, DB 유니크 인덱스).
- 2026-09-07 **단가·상한 확정**: 온 8만/오프 10만, 1일 1건 상한 24만/30만, 멘토 1일 3건, 추가 회차 요청 기능.
- 2026-09-07 **정산 흐름 확정**: 종결 승인 시 확정 스냅샷 → 지급 대기 → 품의 묶음 → 센터 확인 → 종결. 회차 이행(예상)/완료(확정) 이원화.
- 2026-09-07 **사업그룹 A(1기/2R)·B(2기/1R)·C(2기/2R)·D(2기/탈락자)**, 그룹 동적 생성(enum → text), 승계 = `predecessor_case_id`.
- 2026-09-07 **다중 행사 = 한 배포 안의 `programs` 계층**, 1계정 1프로그램, 플랫폼 관리자 플래그. URL `/nextlab` → `/operator` 개명(역할 키는 유지). 설계 → `docs/MODU-DESIGN.md`.
- 2026-09-07 멘티 기능 확정: 회차 서명 · 만족도 조사 · 멘토 변경 요청.
- 2026-09-07 **P3 완료** + 추가 요건 3건(엑셀 일괄 등록 / 멘티 서류 멘토 공개·비공개 / 행사별 문자 API 다중 보안 §21) 구현. 요청 승인함·검수·정산은 P4~P6.
- 2026-09-07 **P7 완료**: 플랫폼 콘솔·부트스트랩 플랫폼 관리자화·브랜딩 잔재 0건·AI 매칭(자동 배정 없음, 채택 시 `adopted_at`, 미채택 배정은 `recommended_rank: null` 감사). 로그인은 통합(`/login`→`/hub`), 행사별 로그인 URL 은 설계 3차 답변대로 폐기.
- 2026-09-07 **보고서 양식·서명 정책 요건**: 컨설팅 보고서 양식을 행사/그룹 단위로 등록, 웹 작성 회차는 저장·서명 시 양식 PDF 재생성. "알림 발송 후 멘티 확인 서명" / "저장 시 멘토 서명 자동" 정책은 양식에 멘토 서명 컬럼이 있을 때만 사용 가능(§22).
- 2026-09-07 **P6 완료**: 설정·요청함·승계·멘토 명단·리포트. 멘토 지급서류 체크는 비밀번호 재인증 + 대행 불가 + 멘토별 감사로그.
- 2026-09-07 **P8 코드 준비 완료**, Vercel 프로젝트 생성은 사용자 조치(런북 `docs/DEPLOY-RUNBOOK.md`). main 머지는 Preview 검증 후.
- 2026-09-08 **플랫폼 통합관리 콘솔 확장**(통합 현황·행사 관리·계정 통합 조회·통합 감사로그·시스템 상태) + 상단 "플랫폼 통합관리자" 배지. 행사·그룹 설정은 운영사, 개설·계정·시스템은 플랫폼 관리자로 역할 분담. 핸드북 `docs/handbook/` 작성.
- 2026-09-08 **P10 조사 캠페인**: 여러 조사 개설(행사/그룹/개별 대상, 기간), 대상자 스냅샷 + 토큰 링크(문자·플랫폼 공용, 채널 기록), 실시간 분석, 미참여 독려 문자, 종결 만족도 실시간 분석·독려. 등급 검수: grade 는 program_members(행사별) 저장 확인.
- 2026-09-08 **P9**: 플랫폼 관리자 = 통합관리 전용 계정(owner/부관리자 계층, 소속 불가), 행사 관리코드 자동 부여, 행사 개설정보 수정, 감사로그 설명+소스 팝업, 운영사 등급 PL/PM/부PM/옵저버 + 행사별 권한 override, 직위·담당역할 기록, 종합결과리포트(스냅샷, 5개 형식 내보내기).
- 2026-09-08 **행사별 역할(설계 B) 확정·구현**: `program_members.role` 신설(0059), 가드가 컨텍스트 행사의 역할로 프로필 role 치환, 명단·알림·매칭·배정은 멤버십 역할 기준, 회원관리에 기존 계정 추가·역할 변경·소속 해제, 케이스 등록 시 기존 계정 자동 연결. 회원관리·문자 수신자·발주처 멘토 현황을 행사 범위로 교정.
- 2026-09-08 **P11 명단 우선 등록**: 멘티·멘토는 이름/이메일/연락처/소속/직위로 우선 등록 → 로그인 안내 문자(행사별 SMS API) → 첫 로그인. 멘티 = 등록 즉시 확정, 멘토 = Pool(배정 시 그 멘티에 대해서만 확정). 운영사 담당자가 회원 정보 수정(이메일은 auth 동기화). 멘티/멘토 리스트 임의 컬럼(카테고리 마크) = `roster_columns`/`roster_values` (0062).
- 2026-09-08 **P12 팀·회차 2단계**: 멘티 = 개인 또는 팀(팀명·아이템명·아이템설명·지역·팀원, `case_team_members`), 팀 대표가 아닌 팀원도 멘토링 참여 가능(회차 `participants` 스냅샷). 회차 등록 = 1단계 계획/실행(사전/사후, 일자·10분 단위 시간·운영시간 자동계산·방법·참가자·장소 — 장소 외 클릭 선택) → 2단계 실서류(보고서). 이행 인정·정산·종결·멘티 서명은 보고서 등록(`report_registered_at`) 기준.
- 2026-09-09 **P15 기능 플래그 잠금**: 위촉 서식 기능은 주민등록번호 포함 개인정보 보관 이슈 보완 전까지 **전 행사 기본 비활성**(`programs.features.mentor_forms`). 운영사 메뉴에 노출되지 않으며, 활성 전환은 플랫폼 통합관리자가 행사 상세에서 직접 수행한다. (사용자 결정: "추후 보완하여 활성모드로 직접 변경")
- 2026-09-09 **P14 위촉 서식 그룹별 셋팅**: 서식 사용 여부·수령 방식(웹작성/업로드)·내용을 사업그룹별로 override(없으면 행사 공통). 업로드 방식은 운영사가 표준양식 파일을 등록해 멘토가 다운로드 후 작성·업로드. 멘토 적용 규칙 = 소속 그룹 설정 우선 → 행사 공통, 집계 대상도 유효 설정 기준.
- 2026-09-09 **P13 위촉 서식 4종**: 공고문(hwp) 붙임2의 위촉 동의서·개인정보 동의서·서약서·사전 확인서를 표준 양식으로 내장. 행사별로 운영사가 사용 여부·수령 방식(웹 작성/파일 첨부)·본문을 편집(기본값 복원 가능), 멘토는 /mentor/forms 에서 제출(최초 1회), 집계현황은 멘토 명단 상단. 주민등록번호는 SMS_KEK 파생 키 봉투암호화(`rrn_sealed`), 원문 열람은 민감정보 권한 한정.
- 2026-09-08 **P8 배포 완료**: Vercel `modu` 를 대시보드에서 생성(작업 브랜치가 Production 으로 배포됨), `NEXT_PUBLIC_*` 는 Config 타입·나머지는 Secret, Vercel Authentication 해제, `/api/setup` 부트스트랩 → 플랫폼 관리자 로그인·`/hub`·대시보드 확인. 첫 배포의 런타임 오류(Supabase URL 누락)는 환경변수 재입력으로 해소.
- 2026-09-07 **P5 완료**: 회차 서명은 `signatures.log_id` 로 회차에 귀속, 서명 후 멘토 수정 잠금. 만족도는 종결 요청 이후 1회, 정산 게이트 아님. 멘토 변경 요청 수락 = T3 교체. 필수서류 게이트는 설정 `closure_policy.require_group_docs`(기본 꺼짐).
- 2026-09-07 **P4 완료**: 정산 계산 단일 함수(`compute.ts`) + vitest, 검수 승인 시 스냅샷 선저장 후 전이, 품의 2단계 게이트(렛츠 제출 → 센터 확인 → closed), 부분 정산(T10/T11a/T11b). 추가 회차 요청 승인함은 P6.
- 2026-09-07 **2차 답변 10건 반영**: 기타소득 원천징수(8.8%) · 멘티·날짜 합산 상한 · 정산 = 케이스×멘토(중도 종료 부분 정산, `reassignment_pending`) · 만족도 그룹별 표준양식 · 행사별 로그인 · 한도 전부 설정 페이지 · AI 매칭 추천(자동 배정 없음) · 멘토 지급서류 체크(비밀번호 재인증·일괄). 열린 항목은 `docs/MODU-DESIGN.md §11` 4건(기본값으로 진행).
