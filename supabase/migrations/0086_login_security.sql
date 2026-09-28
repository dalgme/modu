-- 0086 (2026-09-28) P35-A — 로그인 보안: 실패 기록·잠금 · 담당자 2단계 인증(문자 OTP) · 신뢰 기기
--  배경: docs/SECURITY-POLICY.md §3-1 A5(실패 잠금 없음)·A9(2FA 없음)·C7(로그인 감사 없음) → 로드맵 R-2·R-6.
--  대상: 발주처·운영사 역할을 어느 행사에서든 가진 계정 + 플랫폼 관리자(users.is_platform_admin). 멘토·멘티는 대상 아님.
--  세 표 모두 서비스롤 전용(RLS 활성 + 정책 없음) — 접근은 src/lib/auth/login-security.ts 의 createAdminClient() 경로뿐이다.
--  원문 식별자·IP 는 저장하지 않는다(identifier_hash / ip_hash = sha256).

-- 1) 로그인 시도 기록 — 성공·실패·잠금 전부. 계정 잠금(10분 내 5회 → 15분)·IP 차단(10분 내 30회 → 15분) 판정의 원천.
--    감사로그(audit_logs)에는 잠금·MFA 이벤트만 남기고 매 시도는 이 표에만 둔다(감사 폭주 방지).
create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  identifier_hash text not null,
  user_id uuid references public.users (id) on delete set null,
  ip_hash text,
  success boolean not null default false,
  reason text,
  user_agent text
);

comment on table public.login_attempts is
  '(P35-A) 로그인 시도 기록. 서비스롤 전용. identifier_hash = 입력 식별자(소문자·정규화) sha256, ip_hash = IP sha256. reason: bad_password / unknown_identifier / inactive / locked / ip_blocked / no_phone / sms_failed …';
comment on column public.login_attempts.reason is '실패 사유 코드 (성공은 null). locked / ip_blocked 는 잠금 중 시도 — 잠금 산정에서 제외한다';

create index login_attempts_identifier_idx on public.login_attempts (identifier_hash, created_at desc);
create index login_attempts_ip_idx on public.login_attempts (ip_hash, created_at desc);

alter table public.login_attempts enable row level security;

-- 2) 로그인 2단계 인증번호 — password_reset_otps(0031) 와 같은 구조(sha256 해시·5분 만료·5회 시도) + 발급 IP 해시.
create table public.login_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  ip_hash text
);

comment on table public.login_otps is
  '(P35-A) 담당자 로그인 2단계 문자 인증번호. 코드는 sha256 해시만 저장. 서비스롤 전용. 5분 만료·5회 시도·발급 60초 쿨다운은 코드(login-security.ts)에서 강제.';

create index login_otps_user_idx on public.login_otps (user_id, created_at desc);

alter table public.login_otps enable row level security;

-- 3) 신뢰 기기 — OTP 통과 시 "이 기기 30일 기억" 을 선택하면 랜덤 토큰을 쿠키(원문)로 주고 여기엔 sha256 만 둔다.
--    플랫폼 콘솔 [신뢰 기기 해제] 는 revoked_at 을 채운다(행 삭제 없음 — 이력 보존).
create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  user_agent text,
  ip_hash text,
  revoked_at timestamptz
);

comment on table public.trusted_devices is
  '(P35-A) 2단계 인증 신뢰 기기(30일). token_hash = 쿠키 토큰의 sha256. 서비스롤 전용.';

create index trusted_devices_user_idx on public.trusted_devices (user_id);

alter table public.trusted_devices enable row level security;
