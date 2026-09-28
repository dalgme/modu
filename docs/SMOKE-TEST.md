# 배포 화면 자동 점검(스모크 테스트) 안내

> 대상: 운영 담당자·배포 담당자. 코드를 몰라도 설정하고 결과를 볼 수 있게 썼다.
> 기술 상세는 `e2e/README.md`.

## 1. 왜 필요한가

2026-09-28 운영 장애: 코드 검사 4종(타입검사·린트·빌드·단위테스트)은 전부 통과했는데, **실제로 화면을 열어야만** 드러나는 오류(서버→클라이언트 컴포넌트 직렬화 실패)로 운영사·멘토·멘티 화면 전체가 500 이 났다.
그래서 배포가 끝날 때마다 **로봇이 4개 역할로 진짜 로그인해서 주요 화면을 전부 열어 보고**, 하나라도 깨져 있으면 빨간 X 를 남기는 장치를 만들었다.

## 2. 무엇을 검사하나

| 역할 | 계정(이메일) | 여는 화면 수 | 예 |
|---|---|---|---|
| 발주처 | `smoke-institution@modu.test` | 21 | 대시보드·리포트 7탭·종합리포트·정산 확인(품의/지출 예상)·멘토 현황·요청·문자·이용방법·케이스 상세 |
| 운영사 | `smoke-nextlab@modu.test` | 60 | 대시보드·리포트 7탭·검수 3탭·회원 명단 7탭·게시판 6탭·정산 3탭·조사·운영 설정 15탭·문자 4탭·멘티 등록·케이스 상세 |
| 멘토 | `smoke-mentor@modu.test` | 10 | 대시보드·스케줄·정산 내역·프로필·서명·문의/메시지·이용안내·담당 멘티 상세 |
| 멘티 | `smoke-mentee@modu.test` | 8 | 진행 현황·스케줄·회차 서명·만족도·서류·문의/메시지·동의 |
| 공개 | (로그인 없음) | 8 | 헬스(`/api/health`)·안내서(`/guide.html`)·로그인 폼·약관·비밀번호 재설정·보호 화면 로그인 유도 |

각 화면은 **데스크톱(크롬)과 휴대폰(iPhone 13 크기)** 두 번 열린다 → 총 214건(107 화면 × 2).
화면마다 네 가지를 확인한다: ① 서버 응답이 오류(400 이상)가 아닌가 ② "Application error"·"Digest:" 같은 오류 화면이 아닌가 ③ 로그인 화면으로 튕기지 않았나 ④ 브라우저 실행 오류가 없나.

> 플랫폼 관리자 화면(`/platform`)은 점검 계정이 없어 검사하지 않는다.

## 3. 점검용 계정과 데이터

시드 API(`POST /api/ops/smoke-seed`)가 다음을 **자동으로 만들고, 이미 있으면 비밀번호만 다시 맞춘다**(몇 번 실행해도 안전).

- 행사 **"자동 점검(스모크)"** (관리코드 `smoke`) — 발주처 "점검 발주처", 운영사 "점검 운영사"
- 사업그룹 1개(코드 `SMOKE`, 4회차), 단가(온라인 8만/오프라인 10만)·운영 한도(기본값)
- 계정 4개(위 표, 비밀번호 = `SMOKE_PASSWORD`), 최초 비밀번호 변경·멘티 개인정보 동의 **완료 상태**
- 멘티 케이스 1건 + 멘토 배정 + 회차 1건(오늘, 온라인)
- **문자·알림은 나가지 않는다** — 이 행사의 알림 이벤트를 전부 끄고, 배정 안내 문자 발송 기록을 미리 채워 둔다.

> ⚠ 이 행사는 실제 운영 DB 에 함께 있으므로 **플랫폼 통합 현황(행사 수·계정 수)에 1건씩 섞인다.** 운영 행사 안의 통계(리포트·정산)에는 섞이지 않는다(행사 범위 격리). 점검 행사를 없애고 싶으면 플랫폼 콘솔에서 행사를 종료 처리하면 되고, 다음 점검 때 다시 active 로 되살아난다.

## 4. 설정 (한 번만)

### 4-1. 비밀값 2개 만들기

| 이름 | 값 | 용도 |
|---|---|---|
| `SMOKE_SEED_TOKEN` | 터미널에서 `openssl rand -hex 32` 결과(64자) | 시드 API 를 호출할 때 내미는 열쇠. 비어 있으면 시드 API 는 항상 403(꺼짐). |
| `SMOKE_PASSWORD` | 8자 이상 아무 문자열 | 점검 계정 4개의 로그인 비밀번호 |

### 4-2. Vercel 에 넣기 (서버 쪽)

Vercel → 프로젝트 `modu` → **Settings → Environment Variables** → 위 2개를 **Production 과 Preview 모두**, 타입 Secret 으로 추가 → 저장 후 **재배포**(환경변수는 재배포해야 반영).

### 4-3. GitHub 에 넣기 (로봇 쪽)

GitHub 저장소 `dalgme/modu` → **Settings → Secrets and variables → Actions → New repository secret** → 같은 이름·같은 값으로 `SMOKE_PASSWORD`, `SMOKE_SEED_TOKEN` 2개 추가.

### 4-4. 끝

Vercel 이 배포를 마치면(운영·프리뷰 모두) GitHub 에 "배포 완료" 신호를 보내고, 워크플로 **"Smoke (deployed URL)"** 가 자동으로 그 배포 주소를 점검한다. 별도 켤 것은 없다.

## 5. 결과 보는 법

1. GitHub 저장소 → **Actions** 탭 → "Smoke (deployed URL)" → 최근 실행. 작업 이름에 환경(Production/Preview)이 붙는다.
2. 초록 ✔ = 전부 통과. 빨간 ✖ = 어딘가 깨짐. 커밋 목록·PR 에도 같은 표시가 붙는다.
3. 실패한 실행을 열면 **어떤 역할의 어떤 화면**이 실패했는지 목록으로 보인다(예: `운영사(nextlab) 화면 점검 › /nextlab/settings?tab=rates`).
4. 화면 캡처와 동작 기록이 필요하면 실행 페이지 맨 아래 **Artifacts → `playwright-report-…`** 를 내려받아 압축을 풀고 `index.html` 을 연다.

### 빨간 X 가 뜨면

- **운영 반영(main 푸시)을 멈춘다.** 빨간 X 는 "이 커밋은 화면이 깨진다"는 뜻이다.
- 실패 화면 이름을 개발 담당(Claude Code 세션)에 그대로 전달한다. 리포트의 오류 문구(`Digest: …`)가 있으면 함께.
- 로그인 자체가 실패했다면(`globalSetup 로그인 실패`) 비밀값이 Vercel·GitHub 에서 서로 다르거나 재배포가 안 된 경우가 대부분이다 → §4 를 다시 확인.

## 6. 수동 실행

- **GitHub 에서**: Actions → "Smoke (deployed URL)" → **Run workflow** → `base_url` 에 점검할 주소 입력(예: `https://modu-dalgmes-projects.vercel.app`).
- **내 컴퓨터에서** (Node 20, 최초 1회 `npx playwright install --with-deps chromium`):

```bash
SMOKE_BASE_URL=https://modu-dalgmes-projects.vercel.app \
SMOKE_PASSWORD='점검계정비밀번호' \
SMOKE_SEED_TOKEN='시드토큰' \
npm run smoke
npx playwright show-report e2e/playwright-report      # 결과 HTML 열기
```

`SMOKE_SEED_TOKEN` 을 빼면 시드를 건너뛰고 계정이 이미 있다고 가정한다.

## 7. 문제 해결 (P35-D — 첫 실제 실행에서 겪은 것)

### 7-1. 403 이 여러 화면에서 한꺼번에 뜬다 (Vercel 엣지 차단)

- **증상**: `/hub?pick=1`·`/nextlab/dashboard`·`/mentor/*` 등 수십 화면이 status 403 인데, Vercel 런타임 로그에는 403 이 한 건도 없다.
- **원인**: 앱이 아니라 **Vercel 엣지(DDoS 완화·봇 차단)** 가 GitHub 러너 한 IP 에서 쏟아지는 동시 요청을 막은 것. 이 앱은 권한이 없으면 403 대신 대시보드로 redirect 하므로 **앱이 403 을 내는 일은 없다.**
- **로봇이 하는 일**: 403/429 를 받으면 3초·8초 쉬고 최대 2회 다시 연다. 그래도 막히면 실패 문구에 **"Vercel 엣지 차단(요청 폭주) — 앱 오류 아님"** 이라고 적는다. 워커 2개·파일 안 순차·화면 사이 0.2~0.4초 간격으로 요청 속도를 낮춰 두었다.
- **그래도 반복되면**: ① 잠시 뒤 Actions → Run workflow 로 재실행 ② `playwright.config.ts` 의 `workers` 를 1 로 ③ Vercel → Settings → Deployment Protection → **Protection Bypass for Automation** 에서 비밀값을 만들어 GitHub Secrets 와 로컬 환경변수에 `VERCEL_AUTOMATION_BYPASS_SECRET` 로 넣는다(워크플로 env 에 한 줄 추가 필요). 이 값이 있으면 모든 요청에 `x-vercel-protection-bypass` 헤더가 붙어 배포 보호를 켜도 점검이 돌아간다.

### 7-2. "하이드레이션 불일치" 라고 나온다 (React #418 / #422 / #423 / #425)

- **뜻**: 서버가 만든 HTML 과 브라우저가 다시 그린 화면이 다르다. 화면은 대개 보이지만 콘솔 오류가 나고, 심하면 화면 일부가 사라진다.
- **흔한 원인**: **시간대**(서버는 UTC, 브라우저는 한국시간 — `new Date().getHours()` 처럼 로컬 시각을 쓰면 서버·브라우저 값이 다르다), 난수, `window` 유무로 갈리는 렌더.
- **고치는 규칙**: 날짜·시각 표시는 `src/lib/utils/format.ts` 의 `formatDate/formatDateTime` 또는 `src/lib/utils/kst.ts`(KST 고정) 만 쓴다. 로컬 getter(`getHours/getDay/getDate/toLocaleDateString`)는 금지.
- **리포트 읽기**: 실패 문구에 처음 3개 오류 메시지가 붙는다. 오류 코드 링크(`react.dev/errors/418`)를 열면 React 설명이 나온다.
- **중첩 앵커도 같은 오류(#418)를 낸다**: 카드 전체를 `<Link>`(=`<a>`)로 감싸고 그 안에 전화·문자·메일 `<a>` 를 넣으면 브라우저가 DOM 을 쪼개
  서버 HTML 과 달라진다(2026-09-28 멘토 대시보드 12건). 연락 링크는 카드 링크의 **형제**로 둔다(`mentor-dashboard-v2.tsx`).

### 7-3. 비밀값이 빠졌을 때 보이는 문구

| 로그 문구 | 뜻 | 조치 |
|---|---|---|
| `SMOKE_PASSWORD 환경변수가 필요합니다` | GitHub Secrets 에 `SMOKE_PASSWORD` 없음 | §4-3 |
| `스모크 시드 실패 (403)` | Vercel 의 `SMOKE_SEED_TOKEN` 이 비었거나 GitHub 값과 다름, 또는 재배포 전 | §4-2 → 재배포 |
| `[smoke-seed] SMOKE_SEED_TOKEN 없음 — 계정이 이미 있다고 가정` | GitHub Secrets 에 토큰 없음(경고) | 계정이 이미 있으면 무시 가능 |
| `globalSetup 로그인 실패` / `로그인 페이지에 머물러 있음` | 비밀번호 불일치·계정 비활성 | 두 곳의 `SMOKE_PASSWORD` 가 같은지 확인 |
| `로그인 후 비밀번호 변경 화면으로 이동` | 시드가 안 돌았음(토큰 없이 실행) | `SMOKE_SEED_TOKEN` 넣고 재실행 |

### 7-5. 발주처·운영사 화면만 전부 "로그인 페이지로 튕김(세션 없음)" (2026-09-28 run #6·#7)
- 원인: 작업 브랜치 푸시 + main 푸시 = 배포 2개 → 스모크 2건이 **동시에** 같은 점검 계정으로 돌았다. 각 실행의 시드가 계정 비밀번호를 다시 설정했는데,
  Supabase 의 `admin.updateUserById({ password })` 는 그 계정의 **기존 세션을 전부 무효화**한다 → 먼저 로그인한 실행의 발주처·운영사 세션이 끊겼다
  (멘토·멘티는 두 번째 시드 이후에 로그인해 무사했다).
- 조치(코드): 시드는 지금 비밀번호로 로그인이 안 될 때만 재설정 · 워크플로 `concurrency.group: smoke` 로 한 번에 한 실행만(나머지는 대기).
- 사람이 점검 세션을 열어 둔 상태에서도 시드가 세션을 끊지 않는다.

### 7-6. "2단계 인증(/login/verify) 화면에 멈춤"
- P35-A 담당자 2단계 인증이 켜진 배포(문자 발송 설정 있음)에서는 발주처·운영사 점검 계정이 문자 인증번호를 받을 수 없다.
- 조치: Vercel 환경변수 `MFA_BYPASS_EMAILS=smoke-institution@modu.test,smoke-nextlab@modu.test` (Production·Preview 모두) → 재배포. 우회는 감사 로그 `auth.mfa_bypassed` 에 남는다.
- 문자 발송 설정이 없는 배포(현재)는 2단계 인증을 건너뛰므로(`auth.mfa_skipped_no_sms`) 이 변수 없이도 통검한다.

### 7-4. 리포트 아티팩트가 너무 크다

트레이스는 **재시도 1회째에만** 남기도록 줄였다(`trace: 'on-first-retry'`, 첫 실행분 256MB → 수십 MB). 스크린샷은 실패 화면만, 비디오는 없다.

## 8. 화면을 추가했을 때

새 메뉴·탭을 만들었으면 `e2e/pages.ts` 의 역할별 목록에 경로를 한 줄 추가한다. 목록에 없는 화면은 점검되지 않는다.
