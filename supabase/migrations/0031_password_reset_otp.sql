-- 0031: 비밀번호 자가복구용 SMS 인증번호(OTP) 저장 테이블.
--  분실 시 현재 비밀번호 없이도 등록된 휴대폰으로 받은 6자리 코드로 재설정한다.
--  코드는 해시(sha256)로만 저장하며, 서버(service_role)에서만 접근한다(RLS 클라이언트 정책 없음).

create table if not exists public.password_reset_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_reset_otps_user
  on public.password_reset_otps (user_id, created_at desc);

-- service_role 전용: 클라이언트 정책을 만들지 않아 anon/authenticated 접근을 모두 차단한다.
alter table public.password_reset_otps enable row level security;
