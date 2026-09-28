-- 0087 (2026-09-28) P35-B — 무료 백업 체계 · 보존기간 5년 통일 · 개인정보 보호책임자 연락망 · 보안 이벤트(해킹 시도 감지)
--  배경: docs/SECURITY-POLICY.md §4 R-8b(보존·파기 스케줄) · R-10(백업·복구) · R-13a(방침·동의문 보존기간 통일) · R-14(침해사고 대응 연락망).
--  사용자 결정: 보존기간 = 사업 종료 후 5년(행사별 설정 가능, 기본 5) · 백업은 추가 비용 없이 플랫폼 자체(Supabase PITR 미사용) ·
--             침해사고 통지 책임자 = 발주처 개인정보 보호책임자 1명 + 운영사 PL 1명을 행사 설정에 등록 · 자동 파기는 하지 않는다(결정 ⑦ 미정).
--  원칙: 새 표 3종은 전부 **서비스롤 전용**(RLS 활성 + 정책 없음) — 0085 error_reports 와 같은 원칙. Cron·플랫폼 콘솔·미들웨어 수신 라우트가 createAdminClient() 로만 접근.

-- ---------------------------------------------------------------- 1) programs: 보존기간 · 보호책임자 연락망 · 만료 알림 시각
alter table public.programs
  add column if not exists retention_years int not null default 5 check (retention_years between 1 and 10),
  add column if not exists privacy_officer jsonb not null default '{}'::jsonb,
  add column if not exists retention_notice_sent_at timestamptz;

comment on column public.programs.retention_years is
  '(P35-B) 개인정보 보존기간 — 사업 종료일(ends_on) 후 N년. 개인정보처리방침·멘티 동의문·보존 만료 알림(Cron retention-check)이 이 값을 읽는다. 기본 5.';
comment on column public.programs.privacy_officer is
  '(P35-B) 침해사고 통지·파기 검토 연락망 {client:{name,phone,email}, operator:{name,phone,email}} — client = 발주처 개인정보 보호책임자, operator = 운영사 PL. 운영 설정 [행사 기본] 에서 등록.';
comment on column public.programs.retention_notice_sent_at is
  '(P35-B) 보존기간 만료 예정 문자를 마지막으로 보낸 시각. Cron retention-check 가 30일 간격으로 재통지한다. 자동 파기는 하지 않는다.';

-- ---------------------------------------------------------------- 2) backup_runs: 백업 실행 기록
--  Cron /api/cron/backup(매일 KST 03:00)이 public 스키마 전 테이블을 JSON Lines 로 읽어 AES-256-GCM(SMS_KEK 파생 키)으로 암호화해
--  스토리지 버킷 backups/{yyyy}/{yyyy-mm-dd}T{hhmm}.jsonl.enc 에 올리고 여기에 1행을 남긴다. 실패도 status='failed' + error 로 남긴다(예외를 삼키지 않음).
create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  kind text not null default 'daily' check (kind in ('daily', 'manual')),
  -- 테이블별 행 수 {"cases": 412, "mentoring_logs": 1600, ...}
  tables jsonb not null default '{}'::jsonb,
  -- 암호화 후 업로드한 바이트 수
  bytes bigint,
  storage_path text,
  error text,
  -- 보존 정책(최근 30개 유지·30일 경과분 삭제)으로 파일을 지운 시각. 실행 기록 자체는 남긴다.
  pruned_at timestamptz,
  started_by uuid references public.users (id) on delete set null
);

comment on table public.backup_runs is
  '(P35-B) 플랫폼 자체 DB 백업 실행 기록. 서비스롤 전용. 파일은 스토리지 backups 버킷(비공개, 암호화). 스토리지 문서 파일(documents 버킷)은 크기 때문에 백업 대상이 아니며 메타데이터(documents 표)만 포함된다.';
comment on column public.backup_runs.tables is '테이블별 백업 행 수 (JSON 객체)';
comment on column public.backup_runs.kind is 'daily = Cron 자동 · manual = 플랫폼 콘솔 [지금 백업]';

create index backup_runs_started_at_idx on public.backup_runs (started_at desc);

alter table public.backup_runs enable row level security;

-- ---------------------------------------------------------------- 3) security_events: 보안 이벤트(해킹 시도 감지)
--  kind: scan(스캐너 패턴·비정상 요청 폭주, 미들웨어) / impersonation(대행 시작) / export(대량 반출) / denied(권한 거부) / bruteforce(로그인 실패 폭주, Cron 이 login_attempts 에서 파생)
--  severity: info / warn / critical. Cron /api/cron/security-alert(5분)이 alerted_at null 인 warn 이상을 모아 플랫폼 관리자 문자 1통(30분 쿨다운, critical 은 쿨다운 무시).
create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null,
  severity text not null default 'info' check (severity in ('info', 'warn', 'critical')),
  user_id uuid references public.users (id) on delete set null,
  -- 요청 IP 의 sha256 앞 16자 (원문 미저장 — error_reports 와 동일)
  ip_hash text,
  path text,
  detail jsonb not null default '{}'::jsonb,
  alerted_at timestamptz
);

comment on table public.security_events is
  '(P35-B) 해킹 시도·이상 행위 이벤트. 서비스롤 전용. 미들웨어(스캐너 감지)→POST /api/ops/security-event, 서버 액션(대행·반출·권한 거부)→recordSecurityEvent, Cron security-alert 가 문자 통보.';
comment on column public.security_events.alerted_at is 'Cron 통보 처리 시각(쿨다운 중 생략된 건은 직전 통보 시각). null = 미처리. info 는 통보 대상이 아니라 집계 시 함께 채운다.';

create index security_events_created_at_idx on public.security_events (created_at desc);
create index security_events_unalerted_idx on public.security_events (alerted_at) where alerted_at is null;
create index security_events_kind_created_idx on public.security_events (kind, created_at desc);

alter table public.security_events enable row level security;

-- ---------------------------------------------------------------- 4) 스토리지 버킷 backups (비공개) — 0001 의 insert 패턴
--  storage.objects 정책은 만들지 않는다 → anon/authenticated 는 접근 불가, service_role 만 읽고 쓴다.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- 5) 백업 대상 테이블 목록 함수
--  information_schema 는 PostgREST 로 읽을 수 없어 DB 함수로 제공한다.
--  ⚠ `private` 스키마는 PostgREST 노출 스키마가 아니라 `.rpc()` 로 호출할 수 없다(0005 주석). 그래서 구현은 private 에 두고
--    서비스롤만 실행할 수 있는 얇은 래퍼를 public 에 둔다(revoke from public/anon/authenticated, grant to service_role).
--    anon/authenticated 가 /rest/v1/rpc/list_public_tables 를 부르면 permission denied.
create or replace function private.list_public_tables()
returns table (table_name text, pk_columns text[], row_estimate bigint)
language sql stable security definer set search_path = public as $$
  select
    c.relname::text as table_name,
    coalesce((
      select array_agg(a.attname::text order by k.ord)
      from pg_index i
      join lateral unnest(i.indkey) with ordinality as k(attnum, ord) on true
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
      where i.indrelid = c.oid and i.indisprimary
    ), '{}'::text[]) as pk_columns,
    greatest(c.reltuples::bigint, 0) as row_estimate
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
  order by c.relname;
$$;

create or replace function public.list_public_tables()
returns table (table_name text, pk_columns text[], row_estimate bigint)
language sql stable security definer set search_path = public as $$
  select * from private.list_public_tables();
$$;

revoke all on function public.list_public_tables() from public, anon, authenticated;
grant execute on function public.list_public_tables() to service_role;

comment on function public.list_public_tables() is
  '(P35-B) 백업 대상 = public 스키마 일반 테이블 목록(기본키 컬럼·행 수 추정). service_role 전용 — Cron backup 이 호출.';
