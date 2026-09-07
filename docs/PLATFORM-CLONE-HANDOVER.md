# 플랫폼 복제 핸드오버 — 인프라 구축 가이드

> 원본: `dalgme/restart` (재기지원사업 운영관리 플랫폼, restart.poclab.kr)
> 기준 커밋: `5ca3db0` (2026-09-03)
> 목적: **새 GitHub / Vercel / Supabase 3종 세트에 동일 뼈대를 세우기**

이 문서는 **도메인(사업 내용)과 무관한 인프라 복제 절차**만 다룹니다.
사업 내용을 갈아끼우는 방법은 `DOMAIN-REMODEL-GUIDE.md` 를 보세요.

---

## 1. 스택 요약

| 항목 | 값 |
|---|---|
| 프레임워크 | Next.js **14.2.35** (App Router, RSC + Server Actions) |
| 언어 | TypeScript 5, React 18 |
| DB / 인증 / 스토리지 | Supabase (Postgres 17, Auth, Storage, **RLS 전면 적용**) |
| 스타일 | Tailwind CSS 3.4 + shadcn/ui(Radix) + lucide-react |
| 폼 / 검증 | react-hook-form + zod 4 |
| PDF 생성 | playwright-core + `@sparticuz/chromium` (서버리스 Chromium) |
| PDF 병합 | pdf-lib / 파싱 unpdf |
| 문자 | Solapi (SMS/LMS) — 발신번호 2개 |
| 이메일 | nodemailer (SMTP, 미설정 시 no-op) |
| 서명 | react-signature-canvas |
| 배포 | Vercel (region `icn1` = 서울) |
| 폰트 | Pretendard (로컬 woff2) |

> **Node 런타임 주의**: PDF 생성 라우트는 Chromium을 띄우므로 `maxDuration = 60` 이 필요합니다.
> Vercel Hobby 플랜은 함수 최대 실행시간 제한이 있어 **Pro 플랜 권장**.

---

## 2. 구축 순서 (권장)

```
① GitHub 새 리포 생성 → 코드 복제 → 초기 커밋
② Supabase 새 프로젝트 생성 (region: ap-northeast-2 서울)
③ 마이그레이션 45개 순서대로 적용
④ 스토리지 버킷 3개 확인 (0001 마이그레이션이 생성)
⑤ Vercel 프로젝트 생성 + GitHub 연결
⑥ 환경변수 입력 (아래 3절)
⑦ 배포 → /api/setup 으로 최초 관리자 계정 부트스트랩
⑧ 로그인 → 나머지 계정 발급 → 동작 확인
```

---

## 3. 환경변수 (전수)

`process.env` 사용처를 코드에서 전수 추출한 목록입니다.

### 3-1. 필수 (없으면 앱이 뜨지 않거나 핵심 기능 불가)

| 변수 | 용도 | 획득처 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개(anon) 키 — RLS 적용 클라이언트 | 〃 |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role 키 — RLS 우회. 절대 클라이언트 노출 금지** | 〃 |
| `NEXT_PUBLIC_APP_URL` | 문자/이메일 본문의 링크 주소 | 배포 도메인 |

### 3-2. 운영 필수

| 변수 | 용도 | 비고 |
|---|---|---|
| `CRON_SECRET` | Vercel Cron 인증 | 임의 난수. Vercel이 `Authorization: Bearer` 로 전달 |
| `BOOTSTRAP_TOKEN` | 최초 **플랫폼 관리자** 생성 1회용 토큰 (`/api/setup`) | **사용 후 반드시 삭제** |
| `ANTHROPIC_API_KEY` | AI 멘토 매칭 정성 근거 (선택, 없으면 객관 점수만) | |
| `VIEW_AS_SECRET` | 회원 대행(impersonation) 쿠키 서명키 | 미설정 시 service_role 키에서 파생됨(동작함). 명시 권장 |

### 3-3. 문자 발송 (Solapi)

| 변수 | 용도 |
|---|---|
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` | Solapi 인증 |
| `SOLAPI_SENDER_NUMBER_1` | 발신번호 1 (기본) |
| `SOLAPI_SENDER_NUMBER_2` | 발신번호 2 (보조) |
| `SMS_KEK` | 행사별 문자 API 자격증명 봉투암호화 키(32바이트). 없으면 플랫폼 SOLAPI_* 만 사용 |
| `NEXT_PUBLIC_SMS_PRICE_SMS` / `_LMS` | 관리자 화면 발송비용 표시용 단가 |
| `SMS_FALLBACK_API_KEY` / `SMS_FALLBACK_FROM` | 대체 발송 경로(선택) |

> 미설정 시 `solapiConfigured()` 가 false → 문자 발송이 **조용히 건너뛰어지고 앱은 정상 동작**합니다.
> 발신번호는 사전 등록·인증이 필요하니 초기에 신청해 두세요.

### 3-4. 이메일 (선택)

`SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `SMTP_FROM`
→ 미설정 시 이메일 전송은 **no-op**(앱 정상 동작).

### 3-5. 카카오 알림톡 (미사용 — 자리만 있음)

`KAKAO_ALIMTALK_PROVIDER` `KAKAO_ALIMTALK_API_KEY` `KAKAO_ALIMTALK_SENDER_PROFILE`

### 3-6. 기타

| 변수 | 비고 |
|---|---|
| `CHROMIUM_EXECUTABLE_PATH` | 로컬 개발에서 Chromium 경로 지정 시 |
| `VERCEL` / `NODE_ENV` | 런타임이 자동 주입 |

---

## 4. 데이터베이스

### 4-1. 마이그레이션

`supabase/migrations/0001~0045` 를 **번호 순서대로** 적용합니다. 순서가 곧 의존관계입니다.

```
0001_storage_buckets.sql        스토리지 버킷 3개 + 정책
0002_core_schema.sql            테이블·enum 전체
0003_rls.sql                    RLS 정책 (핵심)
0005_harden_helpers.sql         private.is_staff() 등 보안 헬퍼
...
0030_audit_actor_guard.sql      audit_logs actor_id = auth.uid() 강제
0044_case_edit_grants.sql       임시 수정권한
0045_documents_singleton_doc_keys.sql  서류 중복 방지 유니크 인덱스
```

적용 방법(택1)
- Supabase Dashboard → SQL Editor 에 순서대로 붙여넣기
- Supabase CLI: `supabase db push`
- MCP `apply_migration` 사용

### 4-2. 테이블 (27개)

| 그룹 | 테이블 |
|---|---|
| 사용자·권한 | `users`, `password_reset_otps`, `case_edit_grants`, `audit_logs` |
| 핵심 업무 | `cases`, `case_status_history`, `mentor_assignments`, `support_types`, `support_type_documents`, `support_applications` |
| 산출물 | `documents`, `mentoring_logs`, `signatures`, `document_templates`, `contractors` |
| 심사·지급 | `reviews`, `approvals`, `payment_applications` |
| 커뮤니케이션 | `notifications`, `scheduled_messages`, `inquiries`, `board_posts`, `board_replies`, `operator_requests`, `supplement_requests`, `faqs` |
| 설정 | `app_settings` |

### 4-3. enum

```sql
user_role          institution | nextlab | mentor | mentee
support_type_code  management_improvement | closure
case_status        (11단계 — DOMAIN-REMODEL-GUIDE 참조)
calc_method        fixed | area_cap
closure_status     closed | pending
signer_type        mentor | mentee | contractor
review_result      approved | revision_requested
approval_type      support | payment
approval_result    approved | rejected
```

### 4-4. RLS 설계 (그대로 가져갈 것)

핵심 헬퍼가 `private` 스키마에 있습니다.

| 함수 | 의미 |
|---|---|
| `private.is_staff()` | role ∈ (institution, nextlab) AND is_active |
| `private.is_mentor_of(case_id)` | 해당 케이스의 활성 배정 멘토 |
| `public.can_access_case(case_id)` | is_staff OR 본인 멘티 OR 담당 멘토 |

> ⚠ **중요**: 대부분의 서버 액션은 `createAdminClient()`(service_role, RLS 우회)를 쓰고,
> **애플리케이션 계층에서 권한을 재검증**합니다. RLS는 2차 방어선입니다.
> 새 프로젝트에서도 이 이중 구조를 유지하세요.

### 4-5. 스토리지 버킷 (3개)

| 버킷 | 용도 |
|---|---|
| `documents` | 신청서·보고서·증빙 등 모든 문서 |
| `photos` | 멘토링 현장사진 |
| `signatures` | 전자서명 이미지 |

업로드는 **브라우저 → `_staging/` 직접 업로드 → 서버가 케이스 폴더로 이관** 방식입니다
(`moveFile`). 경로 조작 방지를 위해 서버가 `_staging/` 접두를 검증합니다.

---

## 5. Vercel 설정

### 5-1. Cron (`vercel.json`)

```json
{
  "regions": ["icn1"],
  "crons": [
    { "path": "/api/cron/dispatch-notifications", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/overdue-reminders",      "schedule": "0 0 * * *" },
    { "path": "/api/cron/mentor-weekly-reminder", "schedule": "30 3 * * 1" }
  ]
}
```
> Cron 스케줄은 **UTC** 입니다. `30 3 * * 1` = 월요일 12:30 KST.
> Vercel Hobby 플랜은 Cron 개수/주기 제한이 있으니 확인하세요.

### 5-2. 빌드

기본값 그대로(`next build`). 추가 설정 불필요.
`NEXT_PUBLIC_*` 변수를 바꾸면 **빌드 캐시 없이 재배포**해야 반영됩니다.

---

## 6. 최초 부트스트랩

셀프 가입이 없는 시스템입니다. 배포 직후 아래로 첫 관리자 계정을 만듭니다.

```bash
curl -X POST https://<배포주소>/api/setup \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: <BOOTSTRAP_TOKEN>" \
  -d '{"email":"admin@example.com","name":"관리자","phone":"010-0000-0000"}'
```

- 응답으로 **임시 비밀번호**가 돌아옵니다. 최초 로그인 시 변경이 강제됩니다.
- 이미 관리자가 있으면 **409로 자동 차단**(재실행 불가).
- 완료 후 `BOOTSTRAP_TOKEN` 환경변수를 **삭제**하세요.

이후 계정 발급은 화면에서: 관리자 → 회원관리 → 계정 발급 (역할별).

---

## 7. 복제 시 반드시 바꿔야 하는 것 (보안)

| 항목 | 이유 |
|---|---|
| 모든 Supabase 키 | 새 프로젝트의 키로 전면 교체 |
| `CRON_SECRET`, `BOOTSTRAP_TOKEN`, `VIEW_AS_SECRET` | 새 난수로 재생성 |
| Solapi 키·발신번호 | 새 계정/신규 등록 발신번호 |
| `NEXT_PUBLIC_APP_URL` | 새 도메인 |
| `robots.ts` | 원본은 전체 색인 차단(내부 도구). 정책에 맞게 조정 |
| Sentry/모니터링 | 원본 restart에는 미적용 |

> 원본 리포의 `.env` 값을 **절대 그대로 복사하지 마세요.** 별개 시스템으로 분리하는 것이 목적입니다.

---

## 8. 복제 후 동작 확인 체크리스트

- [ ] `/` 접속 → `/login` 리다이렉트
- [ ] `/api/setup` 으로 관리자 생성 → 임시 비밀번호 수령
- [ ] 로그인 → 비밀번호 변경 강제 화면 → 변경 → 대시보드 진입
- [ ] 회원관리에서 각 역할 계정 발급
- [ ] 케이스 1건 등록 (파일 업로드 포함) → 스토리지에 파일 적재 확인
- [ ] PDF 생성 1회 (Chromium 동작 확인 — **가장 깨지기 쉬운 지점**)
- [ ] 문자 발송 1건 (Solapi 연동 시)
- [ ] Cron 라우트를 수동 호출해 200 확인
- [ ] 다른 역할로 로그인해 **권한 격리** 확인 (RLS + 앱 가드)

---

## 9. 알려진 운영 주의사항 (원본에서 겪은 것)

1. **PDF 생성이 가장 취약** — 서버리스 Chromium 콜드스타트로 타임아웃 발생. 관련 페이지에 `export const maxDuration = 60` 필수.
2. **`getSessionProfile()` 직접 호출 주의** — 대행(impersonation) 기능이 신원을 치환하므로, 스태프 특권 판정은 반드시 `getRealSessionProfile()`.
3. **`audit_logs` RLS** — `actor_id = auth.uid()` 강제. 다른 사람 명의로 감사기록을 남기려면 service_role 경로를 써야 하며, 아니면 **조용히 유실**됩니다.
4. **단일본 서류** — `consulting_report` / `support_application` / `form_*` 는 케이스당 1건. `0045` 유니크 인덱스로 강제됩니다. 교체 의미의 doc_key를 추가하면 이 인덱스도 함께 갱신하세요.
5. **문자는 실패해도 본 작업을 막지 않도록** try/catch로 감싸져 있습니다. 이 패턴을 유지하세요.
