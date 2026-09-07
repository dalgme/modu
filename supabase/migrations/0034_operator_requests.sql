-- 운영사 요청: 진흥원 담당자가 특정 멘티기업(케이스) 기준으로 넥스트랩(운영사)에
-- 처리·확인을 요청한다. 넥스트랩 대시보드에 리스트업되며, 읽지 않은 요청은 강조 표시된다.
create table public.operator_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases(id) on delete set null,
  title text not null,
  body text not null,
  created_by uuid references public.users(id) on delete set null,
  read_at timestamptz,
  read_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index operator_requests_created_idx on public.operator_requests (created_at desc);
create index operator_requests_unread_idx on public.operator_requests (read_at) where read_at is null;
create trigger operator_requests_set_updated_at before update on public.operator_requests
  for each row execute function public.set_updated_at();

alter table public.operator_requests enable row level security;

-- 운영진(진흥원·넥스트랩) 전체 열람
create policy operator_requests_select on public.operator_requests for select
  using (private.is_staff());
-- 진흥원이 요청 등록 (작성자 위조 방지: created_by = 본인)
create policy operator_requests_insert on public.operator_requests for insert
  with check (private.is_institution() and created_by = auth.uid());
-- 넥스트랩이 읽음 처리(update)
create policy operator_requests_update_nextlab on public.operator_requests for update
  using (private.is_nextlab()) with check (private.is_nextlab());
