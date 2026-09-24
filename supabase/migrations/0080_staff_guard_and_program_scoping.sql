-- 0080 — 운영사 등급 보호 · 담당 그룹 · 게시판/문의/요청/예약문자 행사 범위 · 발주처 요청 담당·처리 (2026-09-24)
--
-- 1) program_members.grade: 운영사(nextlab) 의 null 등급을 'pl' 로 백필 (코드 폴백 null→pl 과 동일). 이후 신규 담당자는 코드가 'observer' 기본값을 명시한다.
-- 2) program_members.duty_groups uuid[]: 운영사·발주처 담당자의 [담당 그룹]. support_type_members 에 staff 행을 넣지 않는 이유 —
--    member_role 필터 없이 명부를 읽는 조회(surveys/campaigns.ts, data/cases.ts:283, mentor-forms/data.ts, data/mentors.ts)가 담당자를 멘토로 오인하게 되므로.
-- 3) board_posts / inquiries / operator_requests / scheduled_messages 에 program_id 추가 + 백필 + 행사 범위 RLS.
--    board_posts 'nextlab_only' 글은 발주처가 읽을 수 없게 한다.
-- 4) operator_requests.assigned_to / done_at / done_by — 발주처 요청 담당 지정·처리 완료.

-- 1) 등급 백필 ---------------------------------------------------------------
update public.program_members set grade = 'pl' where role = 'nextlab' and grade is null;

-- 2) 담당 그룹 ---------------------------------------------------------------
alter table public.program_members add column if not exists duty_groups uuid[] not null default '{}';
comment on column public.program_members.duty_groups is '운영사·발주처 담당자의 담당 사업그룹(support_types.id). 비면 담당 지정 없음(모든 그룹).';

-- 3) 행사 범위 ---------------------------------------------------------------
alter table public.board_posts add column if not exists program_id uuid references public.programs(id) on delete cascade;
alter table public.inquiries add column if not exists program_id uuid references public.programs(id) on delete cascade;
alter table public.operator_requests add column if not exists program_id uuid references public.programs(id) on delete cascade;
alter table public.scheduled_messages add column if not exists program_id uuid references public.programs(id) on delete cascade;

-- 백필: 작성자의 활성 멤버십이 정확히 1개인 경우 그 행사로 (모호하면 null 로 두고 운영에서 정리)
create or replace function private.single_program_of(uid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then (array_agg(program_id))[1] end
    from public.program_members pm where pm.user_id = uid and pm.is_active;
$$;

update public.inquiries i set program_id = c.program_id
  from public.cases c where i.program_id is null and i.case_id = c.id;
update public.inquiries i set program_id = private.single_program_of(i.mentee_id) where i.program_id is null;
update public.board_posts b set program_id = private.single_program_of(b.author_id) where b.program_id is null;
update public.operator_requests o set program_id = c.program_id
  from public.cases c where o.program_id is null and o.case_id = c.id;
update public.operator_requests o set program_id = private.single_program_of(o.created_by) where o.program_id is null and o.created_by is not null;
update public.scheduled_messages s set program_id = private.single_program_of(s.created_by) where s.program_id is null and s.created_by is not null;

create index if not exists board_posts_program_idx on public.board_posts (program_id, created_at desc);
create index if not exists inquiries_program_idx on public.inquiries (program_id, status);
create index if not exists operator_requests_program_idx on public.operator_requests (program_id, created_at desc);
create index if not exists scheduled_messages_program_idx on public.scheduled_messages (program_id, scheduled_at desc);

-- board_posts 열람: 작성자 본인 / 그 행사 운영사(전용 글 포함) / 그 행사 발주처(전체 공개만) / 그 행사 멘토(전체 공개만)
drop policy if exists board_posts_select on public.board_posts;
create policy board_posts_select on public.board_posts for select using (
  author_id = auth.uid()
  or (program_id is not null and private.is_program_nextlab(program_id))
  or (program_id is null and private.is_nextlab())
  or (
    visibility = 'all'
    and (
      (program_id is not null and private.is_program_member(program_id) and private.program_role(program_id) in ('institution', 'mentor'))
      or (program_id is null and (private.is_institution() or private.current_user_role() = 'mentor'))
    )
  )
);
-- 답변 열람: 부모 글이 열람 가능하면 (RLS 가 부모 글 select 에 그대로 적용된다)
drop policy if exists board_replies_select on public.board_replies;
create policy board_replies_select on public.board_replies for select using (
  exists (select 1 from public.board_posts p where p.id = post_id)
);
drop policy if exists board_replies_insert on public.board_replies;
create policy board_replies_insert on public.board_replies for insert with check (
  author_id = auth.uid()
  and private.current_user_role() in ('nextlab', 'mentor')
  and exists (select 1 from public.board_posts p where p.id = post_id)
);

-- inquiries: 멘티 본인 / 그 행사 스태프
drop policy if exists inquiries_select on public.inquiries;
create policy inquiries_select on public.inquiries for select
  using (mentee_id = auth.uid() or (program_id is not null and private.is_program_staff(program_id)) or (program_id is null and private.is_staff()));
drop policy if exists inquiries_update_staff on public.inquiries;
create policy inquiries_update_staff on public.inquiries for update
  using ((program_id is not null and private.is_program_nextlab(program_id)) or (program_id is null and private.is_nextlab()))
  with check ((program_id is not null and private.is_program_nextlab(program_id)) or (program_id is null and private.is_nextlab()));

-- operator_requests: 그 행사 스태프 열람, 발주처 등록, 운영사 갱신
drop policy if exists operator_requests_select on public.operator_requests;
create policy operator_requests_select on public.operator_requests for select
  using ((program_id is not null and private.is_program_staff(program_id)) or (program_id is null and private.is_staff()));
drop policy if exists operator_requests_update_nextlab on public.operator_requests;
create policy operator_requests_update_nextlab on public.operator_requests for update
  using ((program_id is not null and private.is_program_nextlab(program_id)) or (program_id is null and private.is_nextlab()))
  with check ((program_id is not null and private.is_program_nextlab(program_id)) or (program_id is null and private.is_nextlab()));

-- scheduled_messages: 그 행사 스태프 열람, 운영사 쓰기
drop policy if exists scheduled_messages_select on public.scheduled_messages;
create policy scheduled_messages_select on public.scheduled_messages for select
  using ((program_id is not null and private.is_program_staff(program_id)) or (program_id is null and private.is_staff()));
drop policy if exists scheduled_messages_write_nextlab on public.scheduled_messages;
create policy scheduled_messages_write_nextlab on public.scheduled_messages for all
  using ((program_id is not null and private.is_program_nextlab(program_id)) or (program_id is null and private.is_nextlab()))
  with check ((program_id is not null and private.is_program_nextlab(program_id)) or (program_id is null and private.is_nextlab()));

-- 4) 발주처 요청 담당·처리 -------------------------------------------------
alter table public.operator_requests add column if not exists assigned_to uuid references public.users(id) on delete set null;
alter table public.operator_requests add column if not exists done_at timestamptz;
alter table public.operator_requests add column if not exists done_by uuid references public.users(id) on delete set null;
create index if not exists operator_requests_open_idx on public.operator_requests (program_id) where done_at is null;
