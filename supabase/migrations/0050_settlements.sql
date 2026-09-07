-- ============================================================================
-- 0050_settlements.sql  (docs/MODU-DESIGN.md §6-3 ~ §6-6)
-- 정산 = 케이스 × 멘토 단위 스냅샷(closure / partial), 지급 품의(settlement_batches),
-- 회차 → 정산 연결(mentoring_logs.settlement_id · 같은 회차 이중 정산 방지).
-- 금액 계산은 앱의 computeSettlement() 한 곳에서만 하고 DB 는 결과를 저장한다.
-- ============================================================================

create table public.settlement_batches (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'confirmed', 'paid')),
  created_by uuid references public.users (id) on delete set null,
  submitted_at timestamptz,
  confirmed_by uuid references public.users (id) on delete set null,   -- 발주처(센터) 정산 확인
  confirmed_at timestamptz,
  paid_at timestamptz,
  total_gross numeric(14, 2) not null default 0,
  total_withholding numeric(14, 2) not null default 0,
  total_net numeric(14, 2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index settlement_batches_program_idx on public.settlement_batches (program_id, status);
create trigger settlement_batches_set_updated_at before update on public.settlement_batches
  for each row execute function public.set_updated_at();

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  mentor_id uuid not null references public.users (id) on delete restrict,
  kind text not null check (kind in ('closure', 'partial')),
  status text not null default 'pending' check (status in ('pending', 'batched', 'confirmed', 'paid', 'canceled')),
  -- 계산 결과 스냅샷
  lines jsonb not null,                       -- [{mode, count, unit_price, amount, is_extra}]
  gross numeric(14, 2) not null,
  taxable numeric(14, 2) not null default 0,
  income_tax numeric(14, 2) not null default 0,
  local_tax numeric(14, 2) not null default 0,
  withholding numeric(14, 2) not null default 0,
  net numeric(14, 2) not null,
  withholding_method text not null check (withholding_method in ('other_income', 'business_income', 'none')),
  withholding_policy jsonb not null,          -- 적용 당시 파라미터 (소급 방지)
  rounds_snapshot jsonb not null,             -- [{log_id, round_no, started_at, mode, unit_price, amount}]
  confirmed_by uuid references public.users (id) on delete set null,   -- 렛츠 확정
  confirmed_at timestamptz,
  batch_id uuid references public.settlement_batches (id) on delete set null,
  paid_at timestamptz,
  canceled_by uuid references public.users (id) on delete set null,
  canceled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 한 멘토는 한 케이스에서 한 번만 정산 (취소본은 제외)
create unique index settlements_case_mentor_key on public.settlements (case_id, mentor_id) where status <> 'canceled';
create index settlements_program_status_idx on public.settlements (program_id, status);
create index settlements_batch_idx on public.settlements (batch_id) where batch_id is not null;
create trigger settlements_set_updated_at before update on public.settlements
  for each row execute function public.set_updated_at();

-- 회차 → 정산 연결 (정산 포함 회차는 잠금·이중 정산 방지)
alter table public.mentoring_logs
  add column settlement_id uuid references public.settlements (id) on delete set null;
create index mentoring_logs_settlement_idx on public.mentoring_logs (settlement_id) where settlement_id is not null;

-- RLS
alter table public.settlement_batches enable row level security;
create policy settlement_batches_select on public.settlement_batches for select
  using (private.is_program_staff(program_id));
create policy settlement_batches_write on public.settlement_batches for all
  using (private.is_program_staff(program_id)) with check (private.is_program_staff(program_id));

alter table public.settlements enable row level security;
create policy settlements_select on public.settlements for select
  using (mentor_id = auth.uid() or private.is_program_staff(program_id));
create policy settlements_write on public.settlements for all
  using (private.is_program_staff(program_id)) with check (private.is_program_staff(program_id));
