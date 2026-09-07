-- 보완 요청: 운영진(넥스트랩·진흥원) 또는 담당 멘토가 멘티에게 '부족 서류 보완'을 요청한다.
-- 멘티 대시보드에 눈에 띄게 노출되고, 멘티가 보완 후 '처리 완료'로 닫는다. (+문자 알림)
create table public.supplement_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  phase text not null default 'general' check (phase in ('pre', 'post', 'general')),
  message text not null,
  created_by uuid references public.users(id) on delete set null,
  created_by_role text,
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index supplement_requests_case_idx on public.supplement_requests (case_id, created_at desc);
create index supplement_requests_open_idx on public.supplement_requests (case_id) where resolved_at is null;
create trigger supplement_requests_set_updated_at before update on public.supplement_requests
  for each row execute function public.set_updated_at();

alter table public.supplement_requests enable row level security;

-- 열람: 운영진 전체 + 해당 케이스의 멘티/담당멘토
create policy supplement_requests_select on public.supplement_requests for select using (
  private.is_staff()
  or exists (select 1 from public.cases c where c.id = supplement_requests.case_id and c.mentee_id = auth.uid())
  or exists (
    select 1 from public.mentor_assignments ma
    where ma.case_id = supplement_requests.case_id and ma.mentor_id = auth.uid() and ma.is_active
  )
);
-- 등록: 운영진 또는 해당 케이스 담당 멘토 (작성자 위조 방지)
create policy supplement_requests_insert on public.supplement_requests for insert with check (
  created_by = auth.uid() and (
    private.is_staff()
    or exists (
      select 1 from public.mentor_assignments ma
      where ma.case_id = supplement_requests.case_id and ma.mentor_id = auth.uid() and ma.is_active
    )
  )
);
-- 처리(resolve): 운영진 또는 해당 케이스 멘티
create policy supplement_requests_update on public.supplement_requests for update using (
  private.is_staff()
  or exists (select 1 from public.cases c where c.id = supplement_requests.case_id and c.mentee_id = auth.uid())
) with check (
  private.is_staff()
  or exists (select 1 from public.cases c where c.id = supplement_requests.case_id and c.mentee_id = auth.uid())
);
