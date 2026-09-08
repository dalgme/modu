# 모두의창업 플랫폼 핸드북

기획 · 구조 · 전달받은 프롬프트를 한 곳에 정리한 문서 묶음이다. 같은 내용을 단일 HTML(`modu-handbook.html`)로도 제공한다(오프라인 열람·인쇄용, 좌측 목차).

| 파일 | 내용 |
|---|---|
| `01-PLANNING.md` | 사업 개요, 주체·역할, 핵심 운영 흐름, 요구사항(1차·2차·3차 답변 + 추가 요건)과 반영 결과, 확정 수치, 결정 기록, 남은 항목 |
| `02-ARCHITECTURE.md` | 기술 스택, 계층·격리, 45개 테이블·마이그레이션, 상태머신 전이표, 회차 규칙, 서류 체계, 정산, 권한·보안·감사, 라우트 지도, 코드 디렉터리 지도, 알림·Cron, 인프라·환경변수, 불변 규칙 |
| `03-PROMPTS.md` | 상시 작업 원칙, 프롬프트 연대기(요지 → 결과), 프롬프트 원문, 다음 세션용 시작 프롬프트 템플릿 |
| `modu-handbook.html` | 위 세 문서를 합친 단일 HTML. `python3 scripts/build-handbook.py` 로 재생성 |

## 관련 원문 문서

| 파일 | 성격 |
|---|---|
| `CLAUDE.md` (루트) | 세션 메모리: 확정 도메인 정의, 불변 규칙, 인프라 현황, 결정 기록 |
| `docs/MODU-DESIGN.md` | 설계 확정본(§0 답변 반영 요약 ~ §22 보고서 양식·서명 정책) |
| `docs/CURRENT-STATE.md` | 개조 전 restart 코드 전수 조사 |
| `docs/DEPLOY-RUNBOOK.md` | P8 배포 절차·환경변수 표·검증 체크리스트 |
| `docs/PLATFORM-CLONE-HANDOVER.md` · `docs/DOMAIN-REMODEL-GUIDE.md` | 원본 뼈대 인수인계·개조 지점 지도 |
| `docs/START-HERE.md` · `docs/CLAUDE-CODE-PROMPTS.md` | modu 세션 분리 시점의 시작 문서·단계별 프롬프트 |
| `docs/design-v1.0.md` · `docs/step-prompts.md` · `docs/README.md` · `docs/DEPLOY.md` | **원본 restart(재기지원) 시절 문서** — 참고용, 모두의창업 기준 아님 |
