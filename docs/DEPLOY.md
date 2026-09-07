# 배포 가이드 (Vercel)

## 1. 사전 상태 (완료됨)

- Supabase 프로젝트: `restart` (서울 `ap-northeast-2`, ref `thgdodvxhxukvwqpzbyi`)
- 마이그레이션 0001~0007 적용 완료 (17테이블 + RLS + 버킷 3종 + 붙임서식 템플릿 4종)
- 보안 어드바이저 0건

## 2. Vercel 프로젝트 생성

1. https://vercel.com/new 에서 `dalgme/restart` import
2. Framework: **Next.js** (자동 감지)
3. Root Directory: `/` (기본)

## 3. 환경변수 (Vercel → Settings → Environment Variables)

| 키 | 값 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://thgdodvxhxukvwqpzbyi.supabase.co` | 공개 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (Supabase 콘솔 → API → anon) | 공개 |
| `SUPABASE_SERVICE_ROLE_KEY` | (Supabase 콘솔 → API → service_role) | **비밀** |
| `CRON_SECRET` | 임의의 긴 랜덤 문자열 | Cron 인증 |
| `BOOTSTRAP_TOKEN` | 임의의 긴 랜덤 문자열 | 최초 관리자 1회 생성용 |

> 알림톡·SMS 는 대행사 계약 후 `KAKAO_ALIMTALK_*`, `SMS_FALLBACK_*` 추가.
> PDF(@sparticuz/chromium)는 `VERCEL` 환경변수(자동)로 동작. 별도 설정 불필요.

## 4. 배포 후 최초 관리자 생성 (1회)

```bash
curl -X POST https://<배포도메인>/api/setup \
  -H "x-bootstrap-token: <BOOTSTRAP_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"email":"admin@nextlab.co.kr","name":"진흥원 관리자"}'
# → { email, tempPassword, userId }
```

- 응답의 `tempPassword` 로 로그인 → 비밀번호 변경 강제.
- 이후 이 계정으로 `/api/admin/users` 또는 화면에서 넥스트랩·멘토 계정 발급.
- **완료 후 `BOOTSTRAP_TOKEN` 환경변수를 제거**(재실행은 institution 존재 시 자동 409 차단).

## 5. Vercel Cron

`vercel.json` 에 정의됨 (알림 발송 5분, 승인대기 독촉 매일). Cron 은 `CRON_SECRET` 으로 보호.

## 6. 최종 점검 체크리스트

- [ ] 4개 역할 로그인 → 역할별 대시보드 분기
- [ ] 12단계 워크플로우 E2E (등록→배정→일지→업체→신청서→검수→승인→통보→증빙→지급신청→지급승인)
- [ ] 붙임서식 PDF 생성·미리보기
- [ ] 모바일(멘토/멘티) 반응형
- [ ] RLS 크로스 접근 차단 (타 역할·타 케이스 URL 직접 접근)
- [ ] noindex 적용 확인 (view-source 메타 robots)
