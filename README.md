# 대전 소상공인·자영업자 재기지원사업 운영관리 플랫폼

2026년 대전일자리경제진흥원 발주 · 넥스트랩 운영대행 사업의 운영관리 플랫폼.

## 개요

- **성격**: 내부 워크플로우·승인 관리 시스템 (일반 SaaS 아님)
- **참여 주체**: 진흥원·넥스트랩·멘토·멘티 4개 역할
- **케이스**: 12단계 워크플로우로 순차 처리
- **예상 규모**: 연 30~100건

자세한 정책·규약은 [`CLAUDE.md`](./CLAUDE.md), 설계·프롬프트는 [`docs/`](./docs) 참조.

## 기술 스택

- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS + shadcn/ui
- Supabase (서울 리전 `ap-northeast-2` 고정)
- 카카오 알림톡 + SMS 대체발송
- Vercel 호스팅

## 시작하기

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env.local
# .env.local 편집

# 개발 서버
npm run dev
```

## 스크립트

- `npm run dev` — 개발 서버 (http://localhost:3000)
- `npm run build` — 프로덕션 빌드
- `npm run start` — 프로덕션 서버
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript 타입 검사
- `npm run format` — Prettier 포매팅
- `npm run format:check` — Prettier 검사

## 브랜치 정책

- `main` — 배포 기준
- `claude/*` — Claude Code 세션 작업 브랜치
- 개인 작업 브랜치는 `feat/*`, `fix/*` 등 Conventional Commits 접두 사용
