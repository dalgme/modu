# 도메인 개조 가이드 — 뼈대는 남기고 사업 내용을 갈아끼우기

> 대상: `dalgme/restart` 를 복제해 **다른 사업**의 플랫폼을 만들 때
> 원칙: **인프라·인증·파일·알림·PDF·감사 뼈대는 그대로**, 업무 모델만 교체

---

## 0. 이 뼈대가 제공하는 "재사용 가능한 자산"

새 사업이 아래 패턴에 해당하면 이 뼈대가 잘 맞습니다.

> **여러 역할이 단계를 밟아가며 서류를 만들고 → 제출하고 → 검수·승인받고 → 정산/지급받는** 업무

| 자산 | 내용 | 재사용성 |
|---|---|---|
| 역할 기반 인증 | 셀프가입 없음, 관리자 발급, 임시비번 강제변경, OTP 재설정 | ★★★ 그대로 |
| 4역할 권한 격리 | RLS + 앱 가드 이중 방어 | ★★★ 이름만 변경 |
| 케이스 워크플로 | 단계 상태머신 + 이력(`case_status_history`) + 진행바 UI | ★★★ 단계만 재정의 |
| 문서 관리 | doc_key 체계, 스테이징 업로드, signed URL, 원본 파일명 유지 | ★★★ 키 목록만 교체 |
| PDF 서식 생성 | HTML→PDF, 서명 삽입, 다건 병합 | ★★☆ 서식 교체 |
| 전자서명 | 캔버스 서명 → 서식에 자동 삽입 | ★★★ 그대로 |
| 알림 | 인앱 + SMS(Solapi) + 이메일, 큐 + Cron 디스패치 | ★★★ 문구만 교체 |
| 감사 로그 | `audit_logs` + 대행(impersonation) 추적 | ★★★ 그대로 |
| 관리자 도구 | 회원관리, 화면 대행, 문자발송 현황, 감사로그, 기능 토글 | ★★★ 그대로 |
| 게시판/문의 | Q&A, FAQ, 보완요청 | ★★★ 그대로 |

**잘 안 맞는 경우**: 실시간성이 핵심(채팅/스트리밍), 대량 트래픽 커머스, 복잡한 결제·정산이 주기능.

---

## 1. 교체 지점 지도 (여기만 바꾸면 됩니다)

### ① 역할 — `user_role` enum

**DB**: `supabase/migrations/0002_core_schema.sql`
```sql
create type user_role as enum ('institution', 'nextlab', 'mentor', 'mentee');
```
**코드**: `src/lib/auth/roles.ts`
```ts
export const ROLE_LABELS: Record<UserRole, string> = {
  institution: '진흥원',   // 발주기관 / 심사·승인 주체
  nextlab: '넥스트랩',     // 운영사 / 총괄관리자
  mentor: '멘토',          // 실무 수행자
  mentee: '멘티',          // 수혜자 / 신청자
};
export function roleHome(role) { /* 역할별 홈 경로 */ }
```

> **매핑 요령**: 새 사업의 역할을 이 4개 원형에 대응시키면 개조량이 최소입니다.
> `발주/심사 기관` · `운영 총괄` · `현장 실무자` · `대상자`
>
> 역할 수를 바꾸려면 enum + `ROLE_LABELS` + `roleHome` + 라우트 그룹 + RLS 헬퍼를 함께 수정.

**라우트 그룹**: `src/app/(institution)` `(nextlab)` `(mentor)` `(mentee)` `(admin)` `(auth)`
→ 폴더명 변경 + 각 `layout.tsx` 의 가드 함수 교체

---

### ② 사업 유형 — `support_type_code` enum

```sql
create type support_type_code as enum ('management_improvement', 'closure');
-- 경영개선 / 폐업정리
```
새 사업의 지원 유형으로 교체. 유형별로 **단계 수와 필요 서류가 달라지는 구조**가 이미 있습니다
(`support_types`, `support_type_documents` 테이블 + `logRequirement()`).

관련 코드:
- `src/lib/workflow/mentor-tasks.ts` → `logRequirement()` : 유형별 최소/최대 회차
- `src/components/cases/mentor-workflow.tsx` : 유형별 단계 분기(`isClosure`)

---

### ③ 진행 단계 — `case_status` (핵심)

**`src/types/case-status.ts`** 가 상태머신의 단일 원천입니다.

| step | status | 의미(원본) |
|---|---|---|
| 1 | `registered` | 대상자 등록 |
| 2 | `mentor_assigned` | 실무자 배정 |
| 3 | `contacted` | 대상자 확인·연락 |
| 4 | `log_completed` | 현장 활동 완료 |
| 5 | `application_drafted` | 신청서 작성·접수 준비 |
| 6 | `under_review` | 운영사 검수 중 |
| 7 | `reviewed` | 운영사 검수 완료 |
| 8 | `approved` / `rejected` | 기관 승인/반려 |
| 9 | `notified` | 승인 통보 |
| 10 | `payment_application_drafted` | 지급신청서 작성 |
| 11 | `payment_approved` | 지급 완료 |
| 0 | `withdrawn` | 종료/포기 |

**개조 방법**
1. enum 값과 `CASE_STATUS_META`(라벨·step)를 새 단계로 교체
2. `CASE_STEP_ORDER` 갱신 (화면 진행바가 이걸 씁니다)
3. 상태 전이가 일어나는 서버 액션의 `.in('status', [...])` 가드를 함께 수정
   → `src/lib/workflow/` 아래 `application-actions.ts`, `cases.ts`, `payment.ts` 등

> ⚠ **함정**: UI의 버튼 활성 조건과 서버 액션의 상태 게이트가 **어긋나면**
> "버튼은 눌리는데 실패" 가 납니다. 원본에서 실제로 겪은 버그이니 반드시 짝을 맞추세요.

---

### ④ 서류 체계 — `doc_key`

문서는 `documents.doc_key` 문자열로 구분합니다. 스키마 변경 없이 종류를 늘릴 수 있는 구조입니다.

| 성격 | 예시 | 규칙 |
|---|---|---|
| 단일본(교체) | `consulting_report`, `support_application`, `form_*` | 케이스당 1건 — **유니크 인덱스로 강제**(0045) |
| 누적 | `mentoring_report`, `mentoring_photo`, `contractor_*`, `payment_*` | 여러 건 허용 |
| 이력 보존 | `application_pdf` | 재등록해도 이전본 보존, 열람은 최신본 |

**개조 시**
- 새 doc_key 목록을 정의하고, 단일본이면 `0045` 마이그레이션의 인덱스 조건에 추가
- 업로드 UI: `CaseDocUpload` 컴포넌트 재사용(라벨·키만 지정)
- ZIP 묶음: `src/lib/data/application-bundle.ts` 의 폴더 분류 갱신

---

### ⑤ PDF 서식

- 템플릿 정의: `src/lib/documents/templates.ts`
- 렌더: `src/lib/documents/render.ts` (HTML → Chromium → PDF)
- DB: `document_templates` 테이블
- 한글 폰트: `src/lib/documents/korean-font-data.ts` (base64 임베드 — **그대로 재사용**)

새 사업의 서식 HTML만 갈아끼우면 됩니다. 서명 삽입 자리(`signImgFor`)는 그대로 동작합니다.

---

### ⑥ 알림 문구

- `src/lib/notifications/templates.ts` — 문자/인앱 문구
- 발송 트리거: `queueNotification(...)` 호출부의 `triggerEvent`
- 정기 알림: `src/lib/notifications/mentor-weekly-reminder.ts`

문구에 사업명·기관명이 하드코딩돼 있으니 전수 치환하세요.

---

### ⑦ 브랜딩 · 문구

| 위치 | 내용 |
|---|---|
| `src/app/layout.tsx` | `<title>`, description, manifest, 테마색 |
| `src/app/manifest.ts` | PWA 앱 이름/아이콘 |
| `public/` | 아이콘(192/512), apple-touch-icon |
| `src/app/robots.ts` | 원본은 **전체 색인 차단**(내부 도구). 공개 서비스면 변경 |
| 전역 | "재기지원", "진흥원", "넥스트랩", "대전" 문자열 전수 치환 |

**치환 확인 명령**
```bash
grep -rn "재기지원\|진흥원\|넥스트랩\|대전" src/ | wc -l
```

---

## 2. 개조 순서 (의존관계 고려)

```
1) 역할 확정        → user_role enum + roles.ts + 라우트 그룹 + RLS 헬퍼
2) 사업 유형 확정    → support_type_code + support_types 시드
3) 단계 확정        → case_status enum + CASE_STATUS_META + 진행바
4) 서류 목록 확정    → doc_key 카탈로그 + 단일/누적 구분 + 유니크 인덱스
5) 화면 배선        → 역할별 대시보드 + 단계별 작업 화면
6) 서식 교체        → PDF 템플릿
7) 알림 문구 교체
8) 브랜딩 교체
9) 전수 확인        → 역할별 로그인해 권한 격리 + 단계 전이 확인
```

> **1~4를 확정하기 전에 화면부터 만들지 마세요.** 상태머신과 doc_key가 바뀌면 화면을 다시 짜야 합니다.

---

## 3. 그대로 두는 게 좋은 것 (건드리면 손해)

| 영역 | 이유 |
|---|---|
| `src/lib/auth/guards.ts` 의 실제/유효 신원 분리 | 대행 기능의 안전성이 여기 걸려 있음 |
| `private.is_staff()` 계열 RLS 헬퍼 | SECURITY DEFINER + auth.uid() 기반이라 토큰 사칭 불가 |
| 스테이징 업로드(`_staging/` → 케이스 폴더 이관) | 경로 조작 방지 설계 |
| `logAudit` 의 실행자/명의 분리 | 감사 추적의 핵심 |
| 문자 발송 try/catch 격리 | 문자 실패가 본 작업을 막지 않게 |
| 단일본 doc_key 유니크 인덱스 | 서류 중복 재발 방지 (실제로 5건까지 쌓인 사고 있었음) |

---

## 4. 개조 전 반드시 답해야 할 질문

새 프로젝트의 CLAUDE.md에 이 답을 적어두세요.

1. **역할이 몇 개이고 각각 무엇을 하는가?** (원형 4역할에 어떻게 대응?)
2. **케이스 1건의 생애주기는 몇 단계인가?** 각 단계에서 **누가** **무엇을** 하는가?
3. **각 단계에서 오가는 서류는?** 누가 만들고, 누가 검수하고, 몇 건까지 허용되는가?
4. **승인 주체는 누구인가?** 반려 시 어디로 되돌아가는가?
5. **금액/정산이 있는가?** 있다면 계산식은? (`calc_method` 구조 재사용 가능)
6. **알림은 언제 누구에게?** (문자 비용이 발생하므로 초기에 확정)
7. **PDF 서식이 몇 종이고 서명이 필요한가?**
