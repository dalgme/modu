-- 멘티 문의하기(챗봇형 소통: 불편신고/기능요청/가이드/기타).
-- 멘티가 문의를 등록하면 넥스트랩이 대시보드에서 즉시 확인(open 카운트)하고 답변한다.
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  mentee_id uuid not null references public.users(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  category text not null default 'other' check (category in ('complaint', 'feature', 'guide', 'other')),
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  answer text,
  answered_by uuid references public.users(id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inquiries_mentee_idx on public.inquiries (mentee_id);
create index inquiries_status_idx on public.inquiries (status);
create index inquiries_created_idx on public.inquiries (created_at desc);
create trigger inquiries_set_updated_at before update on public.inquiries
  for each row execute function public.set_updated_at();

alter table public.inquiries enable row level security;

-- 멘티 본인 문의 + 운영진(넥스트랩·진흥원) 전체 열람
create policy inquiries_select on public.inquiries for select
  using (mentee_id = auth.uid() or private.is_staff());
-- 멘티 본인만 등록
create policy inquiries_insert on public.inquiries for insert
  with check (mentee_id = auth.uid());
-- 운영진만 답변/상태변경
create policy inquiries_update_staff on public.inquiries for update
  using (private.is_staff()) with check (private.is_staff());
