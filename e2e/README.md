# e2e — 배포 화면 스모크 점검 (P34-A)

배포된 URL 에 점검 계정 4개(발주처·운영사·멘토·멘티)로 **실제 로그인해 주요 화면을 전부 열어 보는** Playwright 스펙.
빌드·타입검사·린트·vitest 가 잡지 못하는 유형(2026-09-28 RSC 직렬화 장애: 서버 컴포넌트가 아이콘 컴포넌트를 클라이언트 props 로 넘겨 레이아웃 전체 500)을 잡는다.
담당자용 안내는 `docs/SMOKE-TEST.md`.

## 파일

| 파일 | 역할 |
|---|---|
| `../playwright.config.ts` | 수집 규칙 `e2e/**/*.smoke.ts`, chromium + 모바일(iPhone 13 에뮬레이션, chromium) 2 프로젝트, 실패 시 스크린샷·트레이스 보관 |
| `global-setup.ts` | ① `SMOKE_SEED_TOKEN` 이 있으면 `POST /api/ops/smoke-seed` 호출(계정·행사·케이스 보장, 케이스 id 를 `.smoke-seed.json`·`SMOKE_CASE_ID` 로 전달) ② 역할 4개 로그인 → `.auth/{role}.json` storageState 저장 |
| `helpers.ts` | `login()`, `expectHealthyPage()`(상태<400 · 오류 문구 없음 · 로그인 튕김 없음 · pageerror 0건), 케이스 링크 탐색, 시드 결과 읽기 |
| `pages.ts` | 역할별 화면 목록 — 내비 컴포넌트·탭 상수에서 추출. **화면/탭을 추가하면 여기도 추가** |
| `{institution,nextlab,mentor,mentee}.smoke.ts` | 역할별 화면 전수 열람 |
| `public.smoke.ts` | `/api/health`·`/guide.html`·로그인 폼·공개 페이지·보호 화면의 로그인 유도 |

## 실행

```bash
SMOKE_BASE_URL=https://modu-dalgmes-projects.vercel.app \
SMOKE_PASSWORD='점검계정비밀번호' \
SMOKE_SEED_TOKEN='시드토큰(선택)' \
npm run smoke                      # = playwright test
npx playwright show-report e2e/playwright-report         # HTML 리포트 열기
npx playwright test --list         # 스펙 수집만 (네트워크 불필요)
npx playwright test e2e/mentor.smoke.ts --project=chromium   # 일부만
```

최초 1회 `npx playwright install --with-deps chromium`.

## 판정 규칙

- 각 화면은 `expectHealthyPage` 로 이동 후 (a) HTTP 상태 < 400 (b) 본문에 `Application error` / `server-side exception` / `Digest:` 없음 (c) 최종 경로가 `/login` 아님 (d) `pageerror` 0건 — 네 가지를 soft assert 로 모아 한 번에 보고한다.
- 권한이 없는 탭이 대시보드로 리다이렉트되는 것은 정상이다(목적은 500·크래시 탐지).
- 케이스 상세(`{caseId}`)는 시드 응답의 id 를 쓰고, 없으면 명단/대시보드 링크에서 찾는다. 그래도 없으면 그 테스트만 skip.
- GitHub Actions(`.github/workflows/smoke.yml`)는 Vercel 배포 성공 이벤트마다 자동 실행된다. **실패 = 커밋에 빨간 X = 운영 반영(main 푸시) 금지.**

## 주의

- `.auth/`(세션 쿠키 포함)·`.smoke-seed.json`·`playwright-report/`·`test-results/` 는 실행 산출물 — 이 폴더의 `.gitignore` 로 제외돼 있다. 커밋하지 말 것.
- 점검 계정·행사(slug `smoke`)는 실제 운영 데이터와 같은 DB 에 있다. 문자·알림은 행사 알림 설정 전부 off + 배정 안내 발송 기록 선기입으로 막혀 있다.
- 스펙 파일 확장자 `.smoke.ts` 는 vitest(`src/**/*.test.ts`)와 겹치지 않는다. `tsc --noEmit` 은 이 폴더도 검사한다.
