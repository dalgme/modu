# 새 프로젝트용 Claude Code 단계별 프롬프트

> 사용법: 위에서부터 **한 단계씩** 새 세션에 붙여넣습니다.
> 각 단계가 끝나면 결과를 확인하고 다음으로 넘어가세요. 한꺼번에 주지 마세요.

---

## STEP 0 — 세션 시작 (매번)

```
이 리포는 dalgme/restart 플랫폼을 복제해 <새 사업명> 용으로 개조하는 프로젝트입니다.
docs/PLATFORM-CLONE-HANDOVER.md 와 docs/DOMAIN-REMODEL-GUIDE.md 를 먼저 읽고,
CLAUDE.md 의 규칙을 지켜 작업하세요.

작업 원칙:
- 추측하지 말고 실제 파일을 읽고 판단할 것
- 코드 변경 후 npm run typecheck / lint / build 3종을 모두 통과시킬 것
- 상태머신(case_status)이나 doc_key 를 바꿀 때는 UI 게이트와 서버 액션 게이트를 반드시 함께 수정할 것
```

---

## STEP 1 — 현황 파악 (읽기 전용)

```
개조를 시작하기 전에 현재 코드베이스를 파악해 주세요. 코드는 아직 바꾸지 마세요.

1. 역할(user_role)이 코드 어디어디에서 쓰이는지 전수 조사
2. case_status 상태머신의 전이 지점(서버 액션)을 모두 찾아 표로 정리
3. doc_key 카탈로그 — 어떤 키가 있고 각각 단일본/누적 중 무엇인지
4. "재기지원 / 진흥원 / 넥스트랩 / 대전" 등 원본 사업 고유 문자열이 몇 곳에 있는지

결과를 docs/CURRENT-STATE.md 로 정리해 주세요.
```

---

## STEP 2 — 역할 교체

```
CLAUDE.md 1절의 역할 정의대로 user_role 을 교체해 주세요.

- supabase/migrations 에 새 마이그레이션 추가 (기존 0002 를 수정하지 말 것)
- src/lib/auth/roles.ts 의 ROLE_LABELS / roleHome
- 라우트 그룹 폴더명과 각 layout.tsx 의 가드
- RLS 헬퍼(private.is_staff 등)의 역할 목록
- guards.ts 의 requireXxx 함수들

주의: getRealSessionProfile / getSessionProfile 의 신원 분리 구조는 그대로 유지하세요.
완료 후 typecheck/lint/build 통과 확인.
```

---

## STEP 3 — 사업 유형 · 단계(상태머신) 교체

```
CLAUDE.md 2절의 생애주기대로 case_status 를 교체해 주세요.

- src/types/case-status.ts 의 CASE_STATUS_META 와 CASE_STEP_ORDER
- DB enum 마이그레이션 (기존 값에서 새 값으로 안전하게 전환)
- 상태 전이가 일어나는 모든 서버 액션의 .in('status', [...]) 가드
- 진행바 UI(ProcessStepBar, CaseStepNumbers)

⚠ 반드시: UI 버튼 활성 조건과 서버 액션 게이트를 짝으로 맞출 것.
어긋나면 "버튼은 눌리는데 실패"가 납니다.

바꾸기 전에 영향 범위를 먼저 보고해 주세요.
```

---

## STEP 4 — 서류(doc_key) 체계 교체

```
CLAUDE.md 3절의 서류 목록대로 doc_key 를 교체해 주세요.

- 각 키의 성격(단일본/누적/이력보존)을 구분
- 단일본 키는 documents 유니크 인덱스 조건에 반드시 포함
- 업로드 UI 는 CaseDocUpload 재사용
- ZIP 묶음 분류(application-bundle.ts) 갱신
- 삭제/교체 로직이 필요한 키에는 delete-then-insert + insert 에러 체크
```

---

## STEP 5 — 화면 배선

```
역할별 대시보드와 단계별 작업 화면을 새 업무 흐름에 맞게 배선해 주세요.

- 기존 컴포넌트를 최대한 재사용 (StepShell, CaseDocUpload, FileActions, CaseTable 등)
- 역할별로 보이는 것과 할 수 있는 것을 명확히 분리
- 열람 전용 화면에서는 실행 버튼이 동작하지 않는 이유를 화면에 표시

한 화면씩 진행하고, 각 화면마다 어떤 역할이 무엇을 할 수 있는지 먼저 확인받으세요.
```

---

## STEP 6 — PDF 서식

```
<새 사업>의 서식을 PDF 로 생성하도록 교체해 주세요.

- src/lib/documents/templates.ts 에 서식 정의
- 한글 폰트(korean-font-data.ts)와 서명 삽입 구조는 그대로 재사용
- PDF 생성 라우트에 export const maxDuration = 60 유지

서식 1종을 먼저 완성해 실제로 PDF 가 나오는지 확인한 뒤 나머지를 진행하세요.
```

---

## STEP 7 — 알림 문구 · 브랜딩

```
1. src/lib/notifications/templates.ts 의 문자/알림 문구를 새 사업에 맞게 교체
2. 원본 사업 고유 문자열(재기지원/진흥원/넥스트랩/대전)을 전수 치환
3. layout.tsx 의 title·description, manifest.ts, robots.ts, 아이콘 교체

치환 후 grep 으로 잔여 0건 확인:
grep -rn "재기지원\|진흥원\|넥스트랩\|대전" src/
```

---

## STEP 8 — 배포 전 점검

```
배포 전 최종 점검을 해 주세요.

1. typecheck / lint / build 3종 통과
2. 환경변수 누락 확인 (PLATFORM-CLONE-HANDOVER.md 3절 대비)
3. 마이그레이션이 새 DB 에 순서대로 적용되는지 확인
4. 역할별 권한 격리 점검 — 각 역할이 접근하면 안 되는 경로/액션 목록과 실제 차단 여부
5. 감사로그가 실제로 남는지 (insert 에러를 삼키는 곳이 없는지)

발견한 문제를 심각도 순으로 보고해 주세요.
```

---

## 자주 쓰는 보조 프롬프트

**영향 범위 먼저 보기**
```
이 변경의 영향 범위를 먼저 조사해서 파일:라인 단위로 보고해 주세요. 아직 코드는 바꾸지 마세요.
```

**버그 진단**
```
<증상>이 발생합니다. 추측하지 말고 실제 코드와 DB 데이터를 확인해서
원인을 특정한 뒤 수정안을 제시해 주세요. 원인 근거(파일:라인)를 함께 보여주세요.
```

**보안 점검**
```
이 변경이 권한 모델에 구멍을 내지 않는지 적대적으로 검토해 주세요.
특히 RLS 우회 경로(service_role)와 대행(impersonation) 상황을 고려하세요.
```
