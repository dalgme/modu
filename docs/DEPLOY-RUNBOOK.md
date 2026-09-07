# 모두의창업(modu) — P8 배포 런북

> 2026-09-07 기준. Supabase `modu`(`osrigknfrzsqjrgihgao`, ap-northeast-2)에 마이그레이션 0001~0058 적용 완료, 코드는 `claude/modu-platform-audit-tutute` 브랜치.
> Vercel 프로젝트는 **아직 없다**. 연동 토큰에 프로젝트 생성 권한이 없어(403) 대시보드에서 직접 만들어야 한다(1절 ⓪).

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
| 9 | 문자 1건: `/nextlab/settings/sms-api` 에 솔라피 키 등록(비밀번호 재인증) → "내 휴대폰으로 테스트" | |
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
