-- 0085 (2026-09-28) P34-B — 화면 오류 자동 보고 저장소
--  배경: 2026-09-28 운영 장애(레이아웃 RSC 직렬화 오류 → 운영사·멘토·멘티 화면 전체 "Application error … Digest 304861364")를
--        하루 뒤에야 인지했다. 오류 경계(error.tsx / SafeSlot)가 브라우저에서 POST /api/client-error 로 보고하면 이 표에 쌓이고,
--        Cron /api/cron/error-alert(5분마다)이 미통보 건을 모아 플랫폼 관리자 휴대폰으로 문자를 보낸다.
--  - 서비스롤 전용(RLS 활성 + 정책 없음): 보고 라우트·Cron·플랫폼 콘솔이 전부 createAdminClient() 경로다 (0084 notification 설정과 같은 원칙).
--  - IP 원문은 저장하지 않는다(ip_hash = sha256 앞 16자, 레이트리밋·중복 판정용).
--  - user_id/role/program_id 는 보고 시점에 로그인 세션이 있을 때만 채운다(없어도 저장).
--  - alerted_at: Cron 이 통보(또는 쿨다운 중 통보 생략)를 처리한 시각. null = 아직 미처리.
create table public.error_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  digest text,
  message text,
  path text,
  scope text,
  user_agent text,
  user_id uuid references public.users (id) on delete set null,
  role text,
  program_id uuid references public.programs (id) on delete set null,
  ip_hash text,
  alerted_at timestamptz
);

comment on table public.error_reports is
  '(P34-B) 브라우저 오류 경계가 보고한 화면 오류. 서비스롤 전용. Cron error-alert 가 alerted_at null 인 건을 모아 문자 통보.';
comment on column public.error_reports.digest is 'Next.js 오류 digest(서버 오류 코드). 클라이언트 렌더 오류는 null 일 수 있다.';
comment on column public.error_reports.scope is '오류 경계 위치 — root / nextlab / mentor / mentee / institution / admin / platform / hub / global / slot:{이름}';
comment on column public.error_reports.ip_hash is '요청 IP 의 sha256 앞 16자 (원문 미저장)';
comment on column public.error_reports.alerted_at is 'Cron 통보 처리 시각 (쿨다운 중 생략된 건은 직전 통보 시각으로 채움 — 최대값이 마지막 실제 통보 시각이 되도록)';

create index error_reports_created_at_idx on public.error_reports (created_at desc);
create index error_reports_unalerted_idx on public.error_reports (alerted_at) where alerted_at is null;

-- RLS 활성 + 정책 없음 = anon/authenticated 접근 불가, service_role 만.
alter table public.error_reports enable row level security;
