# 백업·복원 안내 (P35-B)

> 대상: 플랫폼 관리자·운영 담당자. `docs/SECURITY-POLICY.md` §4 **R-10**(백업·복구)의 구현 문서.
> 사용자 결정(2026-09-28): **추가 비용 없이** — Supabase 유료 PITR 을 쓰지 않고 플랫폼이 스스로 백업한다.

## 1. 한눈에

| 항목 | 내용 |
|---|---|
| 1차 백업(자동) | 매일 **KST 03:00** Vercel Cron `/api/cron/backup` 이 public 스키마 **전 테이블**을 읽어 암호화 파일로 저장 |
| 저장 위치 | Supabase 스토리지 **비공개 버킷 `backups`** → `/{연도}/{yyyy-mm-dd}T{hhmm}.jsonl.enc` |
| 암호화 | AES-256-GCM. 키 = HMAC-SHA256(`SMS_KEK`, "backup"). 파일마다 난수 IV, AAD = 파일 경로 |
| 보관 | 최근 **30개**는 항상 유지, 그 밖에 **30일** 지난 파일은 자동 삭제(실행 기록은 남음) |
| 기록·확인 | 표 `backup_runs` + 플랫폼 콘솔 **[보안 이벤트] → 백업 현황**(마지막 성공·크기·최근 7회·실패 사유·[지금 백업]) |
| 수동 백업 | 플랫폼 **통합관리자(owner)** 만 [지금 백업] (감사 `backup.manual`) |
| 2차 백업(선택) | GitHub Actions `db-backup.yml` — 주 1회 `pg_dump` → gpg 암호화 → 아티팩트 90일 (§5) |
| 복원 | 자동 복원 **없음**. `scripts/restore-backup.mjs` 로 복호화·열람 → 사람이 검토 후 수동 반영 (§4) |
| 제외 | **스토리지 파일**(documents/photos/signatures 버킷 — 보고서·사진·서명 파일)은 크기 때문에 백업하지 않는다. `documents` 표(경로·doc_key·케이스) 메타데이터만 들어간다 (§6) |

## 2. 원리

1. Cron 이 DB 함수 `list_public_tables()`(0087, service_role 만 실행 가능)로 public 스키마 테이블 목록·기본키를 받는다 — 코드에 테이블 이름을 박아 두지 않으므로 새 표가 생겨도 자동 포함된다 (`backup_runs` 자신만 제외).
2. 테이블마다 기본키 순으로 1,000행씩 끝까지 읽어(`fetchAll`) JSON Lines 로 직렬화한다.
   첫 줄 `{"_meta":{version,startedAt,kind,tables}}`, 이후 `{"_table":"cases","row":{…}}` 한 행씩.
3. `SMS_KEK` 에서 파생한 전용 키로 통째로 암호화한다. 파일 형식: `MODUBK1`(7B) | iv(12B) | tag(16B) | 암호문.
   → 스토리지 파일만 유출돼도 열 수 없고, 환경변수만 있어도 아무것도 알 수 없다. 다른 경로로 옮겨 붙이면(AAD 불일치) 복호화가 실패한다.
4. 버킷 `backups` 에 올리고 `backup_runs` 에 `ok`(테이블별 행 수·바이트·경로) 또는 `failed`(오류 문자열)를 남긴다. 실패는 Cron 응답 500 으로 Vercel 로그에도 남는다.
5. 성공 후 보존 정책(최근 30개 유지·30일 경과분 삭제)을 적용한다.

필요한 환경변수: `CRON_SECRET`(Cron 인증), `SMS_KEK`(암호화 키, 이미 운영 중), `SUPABASE_SERVICE_ROLE_KEY`.
⚠ **`SMS_KEK` 를 바꾸면** 이전 백업은 이전 KEK 로만 열린다 — 교체 전 KEK 를 안전한 곳(비밀 관리 도구)에 보관할 것.

Cron 라우트 `maxDuration = 300`(Vercel **Pro** 기준). **Hobby 플랜**이면 함수 최대 60초라 배포가 거부된다 → `src/app/api/cron/backup/route.ts` 의 값을 60 으로 낮추고, 데이터가 커서 60초를 넘기면 §5 의 pg_dump 2차 백업을 주 백업으로 삼는다. 현재 규모(멘티 400·회차 1,600 규모)는 수 초~수십 초.

## 3. 정상 동작 확인 (주 1회 권장)

- 플랫폼 콘솔 [보안 이벤트] → **백업 현황**: 마지막 성공이 **26시간 이내**인지(넘으면 카드가 노란 테두리), 최근 7회에 `실패` 가 없는지.
- 실패 사유가 `SMS_KEK 가 설정되지 않아…` → Vercel 환경변수 확인. `list_public_tables` 오류 → 마이그레이션 0087 적용 여부. `스토리지 업로드 실패` → 버킷 `backups` 존재 여부(0087 이 만든다).
- 분기 1회 **복원 리허설**(§4-3) — 백업이 실제로 열리는지 확인하지 않은 백업은 백업이 아니다.

## 4. 복원 절차

### 4-1. 준비
로컬 PC 에 Node 20+, 운영 프로젝트의 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`SMS_KEK`(Vercel 환경변수와 같은 값). 이 세 값은 **플랫폼 관리자만** 다루고, 작업 후 셸 히스토리에서 지운다.

### 4-2. 파일 찾기·열기
```bash
export SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... SMS_KEK=...
node scripts/restore-backup.mjs --list                                   # 백업 목록(최근 순)
node scripts/restore-backup.mjs --path 2026/2026-09-28T0300.jsonl.enc --tables     # 테이블별 행 수
node scripts/restore-backup.mjs --path 2026/2026-09-28T0300.jsonl.enc --table cases > cases.jsonl
node scripts/restore-backup.mjs --path ... --table users --where id=<uuid>          # 특정 행만
```
출력은 JSON Lines(한 줄 = 한 행, 컬럼명 = DB 컬럼명). **스크립트는 DB 에 아무것도 쓰지 않는다.**

### 4-3. 되돌리기 (사람이 검토 후 수동)
| 상황 | 방법 |
|---|---|
| 행 몇 개가 잘못 수정/삭제됨 | 위 출력에서 해당 행을 확인 → Supabase Studio(Table editor) 또는 SQL 편집기에서 `update`/`insert` 로 되돌린다. 감사로그에 사유를 남긴다(플랫폼 콘솔 통합 감사로그로 확인 가능) |
| 표 하나가 통째로 손상 | `cases.jsonl` 을 `jq -c` 로 `insert … on conflict (id) do update` SQL 로 변환해 **브랜치/새 프로젝트 DB 에서 먼저 리허설** → 검증 4종 → 운영 반영 |
| DB 전체 손상 | §5 의 pg_dump 아티팩트가 있으면 그것으로 새 프로젝트에 복원(스키마 포함)이 가장 빠르다. 없으면 마이그레이션 0001~최신을 새 프로젝트에 적용한 뒤 JSONL 을 표 순서(FK 부모 → 자식: programs → users → support_types → cases → …)대로 넣는다 |
| 파일(보고서·사진·서명) | 백업 대상이 아니다. 스토리지 버킷 자체는 Supabase 가 관리하는 객체 저장소라 DB 손상과 무관하게 남는다. `documents` 표 메타데이터를 복원하면 파일 링크가 살아난다 (§6) |

복원 리허설(분기 1회): Supabase **Branching**(Pro) 또는 무료 새 프로젝트에 마이그레이션 적용 → 최신 백업 한 표(`cases`)를 넣어 본다 → 행 수·샘플 대조. 결과를 `docs/DEPLOY-RUNBOOK.md` 장애 기록 형식으로 남긴다.

## 5. Supabase 플랜별 백업 제공 범위 (2026-09 기준, 변동 가능 — 대시보드 "Database → Backups" 에서 재확인)

| 플랜 | 자동 백업 | PITR(시점 복구) | 비고 |
|---|---|---|---|
| **Free** | **없음** (Backups 화면에 "Upgrade" 안내만) | 없음 | → 이 문서의 플랫폼 자체 백업 + §5 pg_dump 가 유일한 백업 |
| Pro | 일일 백업 **7일** 보관 (논리 백업, 대시보드에서 복원) | **유료 애드온**(약 $100/월~, 보관 7일 기본) | 파일(스토리지)은 Pro 이상에서도 DB 백업에 포함되지 않음 |
| Team | 일일 백업 14일 | 애드온 | |
| Enterprise | 협의 | 협의 | |

> 확인 필요: 현재 `modu` 프로젝트(`osrigknfrzsqjrgihgao`)의 플랜. Free 면 위 표대로 Supabase 쪽 백업은 전혀 없다. 무료 플랜의 정확한 문구·보관 일수는 https://supabase.com/docs/guides/platform/backups 에서 재확인할 것.

**수동 백업(모든 플랜, 무료)**
- CLI: `supabase db dump --db-url "$SUPABASE_DB_URL" -f dump.sql` (스키마) / `--data-only` (데이터)
- 또는 그냥 `pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges > dump.sql` — 아래 GitHub Actions 가 이것을 자동화한다.

**2차 백업 — GitHub Actions `.github/workflows/db-backup.yml`(선택)**
1. Supabase 대시보드 → Project Settings → Database → Connection string(URI, 비밀번호 포함)을 GitHub 시크릿 `SUPABASE_DB_URL` 에.
2. 긴 암호를 만들어(`openssl rand -base64 32`) 시크릿 `BACKUP_PASSPHRASE` 에. **이 암호를 잃으면 아티팩트를 못 연다** — 비밀 관리 도구에 보관.
3. 매주 월요일 KST 04:00 자동 실행(수동: Actions → "DB backup" → Run workflow). 결과는 실행 페이지 하단 Artifacts `modu-YYYY-MM-DD.sql.gpg`(90일).
4. 복원: `gpg --decrypt modu-2026-09-28.sql.gpg > dump.sql` → 검토 → 새 프로젝트/브랜치 DB 에 `psql "$DB_URL" -f dump.sql` 로 리허설 후 운영 반영.
시크릿이 없으면 워크플로는 경고만 남기고 건너뛴다. 워크플로 파일이 `main` 에 있어야 스케줄이 돈다.

## 6. 스토리지 파일은 왜 제외했나 / 대안

회차 보고서·현장 사진(10장/회차)·서명·지급서류는 수 GB 규모가 되고, Vercel 함수(메모리·시간 제한) 안에서 매일 옮기기엔 부적합하다. 그래서 **DB 백업에는 `documents` 표(파일 경로·doc_key·케이스·업로더)만** 넣고, 파일 자체는 Supabase 객체 저장소에 그대로 둔다(DB 손상과 독립).
파일까지 별도 보관이 필요하면(사용자 결정 필요):
- 운영 PC 에서 분기 1회 `rclone sync` 로 버킷 3개(documents/photos/signatures)를 로컬·외장 디스크로 (무료, 사람 손), 또는
- 케이스별 [서류 일괄 ZIP](`/api/staff/case-docs-zip`)을 종결 시점에 내려받아 발주처 보관 규정대로 보관.

## 7. 보존기간과의 관계

개인정보 보존기간(행사 설정, 기본 **사업 종료 후 5년**)이 지나 파기할 때는 **백업 안의 사본도 파기 대상**이다. 백업 보관이 30일이므로 운영 DB 에서 파기한 뒤 30일이 지나면 백업에서도 사라진다. §5 pg_dump 아티팩트(90일)와 로컬에 내려받은 JSONL 은 사람이 직접 지운다. 파기 절차 자체(익명화·파기 대장)는 `docs/SECURITY-POLICY.md` R-8b 후속 — 현재는 만료 30일 전 문자 알림까지만 구현(자동 파기 없음).
