-- 0096 — 문자 일괄 발송 기록·수신 결과 추적 (2026-11-03)
-- 원인: 일괄 발송이 1명당 API 1회 호출(10건 동시)이라 솔라피 발송 API 한도(5초당 100회)를 넘겨 나머지가 거부됐고,
--       [발송 현황]은 플랫폼 공통 계정만 조회해 행사별 문자 API 로 보낸 문자가 보이지 않았다.
-- 이제 일괄 발송은 솔라피 send-many(1회 호출)로 보내고, 수신자별 결과(접수·수신 완료·실패 사유)를 여기에 남긴다.
create table if not exists public.sms_send_batches (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null default 'bulk' check (kind in ('bulk', 'login_guide', 'retry')),
  title text,
  text_template text not null default '',
  parent_batch_id uuid references public.sms_send_batches(id) on delete set null,
  credential_source text,
  provider_group_ids text[] not null default '{}',
  total int not null default 0,
  last_synced_at timestamptz
);
create index if not exists sms_send_batches_program_idx on public.sms_send_batches(program_id, created_at desc);

create table if not exists public.sms_send_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.sms_send_batches(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  name text not null default '',
  phone text not null,
  text text not null,
  -- rejected = 솔라피가 접수하지 않음 / pending = 접수·이통사 처리 중 / delivered = 수신 완료 / failed = 이통사 발송 실패
  status text not null default 'pending' check (status in ('rejected', 'pending', 'delivered', 'failed')),
  provider_message_id text,
  provider_group_id text,
  status_code text,
  reason text,
  retried_in_batch_id uuid references public.sms_send_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sms_send_items_batch_idx on public.sms_send_items(batch_id);
create index if not exists sms_send_items_msg_idx on public.sms_send_items(provider_message_id);

-- 서비스롤 전용 (화면은 서버에서 행사 범위로 조회)
alter table public.sms_send_batches enable row level security;
alter table public.sms_send_items enable row level security;
