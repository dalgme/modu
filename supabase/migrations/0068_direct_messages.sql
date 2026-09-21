-- 0068 (2026-09-21) P20 — 담당 멘토 ↔ 멘티 간 메시지 (게시판 탭 미니탭)
--  - 케이스 단위 스레드: 발신자·수신자는 그 케이스의 활성 멘토와 멘티 (서버 코드에서 직접 검증 — RLS 는 열람만)
--  - read_at 으로 확인여부·대시보드 알람(미확인 수) 계산

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  recipient_id uuid not null references public.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index direct_messages_case_idx on public.direct_messages (case_id, created_at);
create index direct_messages_recipient_idx on public.direct_messages (recipient_id, read_at);
create index direct_messages_program_idx on public.direct_messages (program_id, created_at desc);

alter table public.direct_messages enable row level security;
-- 열람: 당사자(발신·수신) + 행사 스태프. 쓰기는 service_role(서버 액션)만 — 담당 관계 검증은 코드에서.
create policy direct_messages_select on public.direct_messages for select
  using (sender_id = auth.uid() or recipient_id = auth.uid() or private.is_program_staff(program_id));
