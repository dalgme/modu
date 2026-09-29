# 모두의창업(modu) — P8 배포 런북

> 2026-09-07 기준. Supabase `modu`(`osrigknfrzsqjrgihgao`, ap-northeast-2)에 마이그레이션 0001~0058 적용 완료, 코드는 `claude/modu-platform-audit-tutute` 브랜치.
> **2026-09-08 진행 상황**: ⓪~④ 완료. Vercel 프로젝트 `modu` 생성(대시보드, MCP 토큰은 403), 환경변수 입력, Vercel Authentication 해제, `/api/setup` 부트스트랩, 플랫폼 관리자 로그인·대시보드 확인. 운영 URL `https://modu-dalgmes-projects.vercel.app` — **작업 브랜치 `claude/modu-platform-audit-tutute` 가 Production** 으로 배포돼 있다. 남은 것: ⑤ 검증 체크리스트 → ⑥ 도메인·main 머지.

## 1. 배포 순서 (요약)

```
⓪ Vercel 대시보드(팀 dalgmes-projects) → Add New → Project → Import Git Repository `dalgme/modu`
   · Project Name: modu · Framework: Next.js(자동) · Root Directory: ./ · 빌드 명령 기본값
   · "Deploy" 누르기 전에 Environment Variables 섹션에서 2절 값을 먼저 넣는다 (없으면 첫 빌드 실패)
   · Production Branch 는 기본 main. main 에는 아직 구코드만 있으므로 첫 검증은 브랜치 Preview 로 한다.
① Vercel 프로젝트 modu 환경변수 입력 (2절)                ← 사람이 직접 (비밀값)
② 브랜치 푸시 → Preview 배포 확인 (typecheck·lint·build 는 리포에서 이미 그린)
③ /api/setup 으로 플랫폼 관리자 1회 생성 (3절) → BOOTSTRAP_TOKEN 삭제
④ 로그인 → /hub → 시드 행사 '모두의창업 2026' 진입 → /nextlab/settings 행사 기본(발주처·운영사 기관명) 확인
⑤ 검증 체크리스트 (4절) — 문자 1건 · PDF 1건 · 매칭 1건 · 역할 격리
⑥ main 머지 → Production 배포 → 도메인 연결 → NEXT_PUBLIC_APP_URL 갱신
```

## 2. 환경변수 (Vercel → Project → Settings → Environment Variables, Production + Preview 모두)

| 변수 | 값 / 생성 방법 | 필수 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://osrigknfrzsqjrgihgao.supabase.co` | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` (legacy) 키. 공개 키(RLS 적용) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면의 `service_role` 키. **서버 전용, 절대 노출 금지** | ✅ |
| `NEXT_PUBLIC_APP_URL` | Preview 단계: Vercel 배포 URL / Production: 실제 도메인 (문자·이메일 링크에 쓰임) | ✅ |
| `CRON_SECRET` | `openssl rand -hex 32` — Vercel Cron 인증 | ✅ |
| `VIEW_AS_SECRET` | `openssl rand -hex 32` — 대행 쿠키·행사 컨텍스트 쿠키 서명 | ✅ 권장 |
| `SMS_KEK` | `openssl rand -hex 32` — 행사별 문자 API 봉투암호화 키. **바꾸면 기존 등록 자격증명 전부 무효** | ✅(행사별 문자 사용 시) |
| `BOOTSTRAP_TOKEN` | `openssl rand -hex 32` — `/api/setup` 1회용. **3절 실행 후 삭제** | 1회 |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_SENDER_NUMBER_1` | 플랫폼 기본 문자 발신(행사별 등록이 없을 때 폴백). 없으면 문자 미발송(앱은 동작) | 선택 |
| `ANTHROPIC_API_KEY` | AI 멘토 매칭 정성 근거. 없으면 객관 점수만으로 추천 | 선택 |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | 이메일 알림(5개 전부 있을 때만 활성) | 선택 |
| `NEXT_PUBLIC_SMS_PRICE_SMS` / `_LMS` | 관리자 화면 발송비용 표시 단가 | 선택 |

- `CHROMIUM_EXECUTABLE_PATH` 는 **넣지 않는다** (Vercel 은 `@sparticuz/chromium` 자동 사용, `next.config.mjs` 의 `outputFileTracingIncludes` 로 바이너리 포함).
- 원본 `restart` 프로젝트의 `.env` 값을 복사하지 말 것 — Supabase 프로젝트가 다르다.
- `NEXT_PUBLIC_*` 를 바꾸면 **빌드 캐시 없이 재배포**(Redeploy → "Use existing Build Cache" 해제).
- **Type**: `NEXT_PUBLIC_` 접두 변수는 **Config**, 나머지는 **Secret**. `NEXT_PUBLIC_` 을 Secret 으로 저장하면 Vercel 이 거부한다(공개 접두 + 비밀 타입 불일치). 이미 Secret 으로 저장한 것은 Config 로 못 바꾸므로 삭제 후 재추가.
- **Deployment Protection**: Settings → Deployment Protection → Vercel Authentication 을 **Disabled** 로. 켜져 있으면 멘토·멘티가 Vercel 로그인 화면으로 튕긴다.

## 3. 최초 플랫폼 관리자 부트스트랩 (1회)

```bash
curl -X POST https://<배포주소>/api/setup \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: <BOOTSTRAP_TOKEN>" \
  -d '{"email":"admin@example.com","name":"플랫폼 관리자","phone":"010-0000-0000"}'
# → { email, tempPassword, userId, next: "/platform" }
```

- 생성되는 계정 = 역할 `nextlab` + `is_platform_admin`. 시드 행사(`modu-2026`)에 멤버십이 자동 부여된다.
- 이미 플랫폼 관리자가 있으면 409. 완료 후 Vercel 에서 `BOOTSTRAP_TOKEN` 을 삭제하고 재배포.
- 대안(로컬): `node --env-file=.env.local scripts/bootstrap-admin.mjs <email> <name> [phone]`.

## 4. 검증 체크리스트 (Preview 에서)

| # | 항목 | 확인 |
|---|---|---|
| 1 | 로그인(임시 비밀번호) → 비밀번호 변경 강제 → `/hub` → 행사 배너 → 자동 진입 | |
| 2 | `/platform` 콘솔: 행사 목록에 시드 행사 표시, 스태프 계정 발급 1건 | |
| 3 | `/nextlab/settings` 행사 기본: 발주처·운영사 기관명 저장 → 헤더·대시보드 문구에 반영 | |
| 4 | 멘티 등록(`/nextlab/cases/new`) → 멘토 계정 발급(`/nextlab/members`) → 멘토 배정(AI 추천 카드 생성 포함) | |
| 5 | 멘토 로그인 → 회차 등록(웹 작성) → **보고서 PDF 자동 생성** 확인(케이스 상세 회차 목록의 보고서 링크) ← PDF 1건 | |
| 6 | 멘티 로그인 → `/mentee/rounds` 확인 서명 → PDF 에 서명 반영 | |
| 7 | 멘토 관찰의견서 작성 → 종결 요청 → 운영사 검수 승인 → 정산 스냅샷·정산서 PDF | |
| 8 | `/nextlab/settlements` 품의 편성 → 제출 → 발주처 `/institution/settlements` 정산 확인 → 케이스 `closed` | |
| 9 | 문자 1건: 운영 설정 › 관리 › 문자 API(`/nextlab/settings?tab=sms-api`) 에 솔라피 키 등록(비밀번호 재인증) → "내 휴대폰으로 테스트" | |
| 10 | 역할 격리: 멘토 계정으로 `/nextlab/*` 접근 시 리다이렉트, 발주처 계정으로 설정 저장 액션 실패, 다른 행사 케이스 URL 직접 접근 시 404 | |
| 11 | Cron: Vercel → Cron Jobs 에 3개 등록 확인, `dispatch-notifications` 수동 실행 시 200 | |
| 12 | `/api/setup` 재호출 시 409 (BOOTSTRAP_TOKEN 삭제 후 403) | |

## 5. Production 전환

1. `claude/modu-platform-audit-tutute` → `main` 머지(PR). Vercel 은 `main` 을 Production 으로 빌드한다.
2. 도메인 연결 후 `NEXT_PUBLIC_APP_URL` 을 실제 도메인으로 바꾸고 캐시 없이 재배포.
3. Supabase → Authentication → URL Configuration 의 Site URL / Redirect URL 에 도메인 추가.
4. 운영 시작 전 `BOOTSTRAP_TOKEN` 삭제 여부와 `SMS_KEK` 백업(안전한 비밀 저장소)을 확인.

## 6. 알려진 제약

- 정산서·보고서 PDF 는 서버리스 Chromium 콜드스타트로 첫 호출이 10~20초 걸릴 수 있다(`maxDuration = 60`).
- PDF 생성 실패는 회차 저장·정산 확정을 막지 않고 감사로그(`round.report_render_failed`, `settlement.confirmed.statement=failed`)에 남는다.
- 알림 이벤트별 on/off 설정과 레거시 `/admin/settings/features` 정리는 P8 이후 과제.

## 7. 운영 중 사고 대응 (P34, 2026-09-28 장애 이후)

### 7-1. 증상별 첫 조치 (5분 안에)
| 증상 | 먼저 할 것 |
|---|---|
| 로그인 후 영문 "Application error… Digest: 숫자" | **즉시 되돌리기(7-2)** → 그다음 원인 조사. Digest 숫자를 Claude 세션에 알려주면 Vercel 로그에서 바로 찾는다 |
| 특정 화면만 "화면을 불러오지 못했습니다"(한국어 안내) | 한 화면의 문제. 다른 화면은 정상. 오류 코드와 화면 주소를 전달 |
| 담당자 휴대폰에 "플랫폼 화면 오류 N건" 문자 | `/platform/system` 최근 오류 표 확인 → 같은 화면에서 반복되면 7-2 |
| 사이트 자체가 안 열림(연결 실패) | Vercel 상태 페이지(vercel-status.com)·Supabase 상태 확인. 우리 코드 문제가 아닐 수 있음 |

### 7-2. 즉시 되돌리기 (Instant Rollback) — 원인 몰라도 먼저
1. https://vercel.com/dalgmes-projects/modu 접속 → **Deployments** 탭.
2. 현재 Production(맨 위) 바로 아래, 마지막으로 정상이었던 배포의 `…` 메뉴 → **Instant Rollback** → 확인. 30초 안에 이전 버전으로 돌아간다.
3. DB 는 건드리지 않으므로 데이터 손실 없음. 단, 되돌린 버전이 **새 마이그레이션 이전 코드**면 새 컬럼을 모르는 상태로 돌아가는 것뿐이라 대부분 안전하다(신규 테이블을 쓰는 화면만 비어 보일 수 있음).
4. Claude 세션에서도 가능: "직전 정상 배포로 롤백" 이라고 지시(Vercel MCP `request_rollback`).
5. 원인 수정 후 정상 푸시가 새 Production 이 되면 롤백 상태는 자동 해제된다.

### 7-3. 운영 반영 경로 (반드시 이 순서)
```
작업 브랜치 푸시 → Vercel Preview 배포 → GitHub Actions "smoke" 자동 실행(4개 역할 로그인·전 화면 열기)
   → 초록(통과)일 때만 → git push origin HEAD:main → Production 배포 → smoke 가 Production 에 대해 한 번 더 실행
```
- 전제: Vercel 프로젝트 Settings → Git → **Production Branch = `main`**(2026-09-25 요청, 대시보드에서 변경).
- smoke 가 빨간 X 면 main 에 올리지 않는다. 절차·시크릿은 `docs/SMOKE-TEST.md`.

### 7-4. 자동 감시
- **화면 오류 자동 보고**: 오류 화면(`error.tsx`)이 뜨면 `error_reports` 에 기록되고, Cron `/api/cron/error-alert`(5분마다)가 최근 15분 보고를 모아 플랫폼 관리자 휴대폰(+ 환경변수 `OPS_ALERT_PHONES` 의 번호)으로 문자 1통을 보낸다(30분 쿨다운). 보고 내역은 `/platform/system` 하단.
- **외부 생존 감시(권장, 무료)**: UptimeRobot 등에서 `https://<도메인>/api/health` 를 5분 간격 HTTP 모니터로 등록하고 알림 이메일/문자를 설정한다. `ok:false` 또는 503 이면 DB 연결 실패.
- **배포마다 자동 화면 점검**: 7-3 의 smoke. GitHub 저장소 Actions 탭에서 결과 확인.

### 7-5. 장애 기록 남기기
- 원인·영향 시간·조치·재발 방지를 CLAUDE.md §9 와 §11 에 날짜와 함께 남긴다(2026-09-28 항목 참고). 같은 유형의 코드 규칙은 `scripts/check-rsc-props.mjs` 처럼 lint 에 편입해 재발을 기계적으로 막는다.
