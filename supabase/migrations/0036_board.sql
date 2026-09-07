-- 문의·요청 게시판: 넥스트랩·멘토단 공용. 작성/답변/열람.
-- 가시성(visibility): 'all'(넥스트랩+모든 멘토) / 'nextlab_only'(넥스트랩 + 작성자 본인만).
create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  visibility text not null default 'all' check (visibility in ('all', 'nextlab_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index board_posts_created_idx on public.board_posts (created_at desc);
create trigger board_posts_set_updated_at before update on public.board_posts
  for each row execute function public.set_updated_at();

create table public.board_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index board_replies_post_idx on public.board_replies (post_id, created_at);

alter table public.board_posts enable row level security;
alter table public.board_replies enable row level security;

-- 열람: 넥스트랩·진흥원 전체 / 멘토는 전체공개('all') 또는 본인 글
create policy board_posts_select on public.board_posts for select using (
  private.is_nextlab()
  or private.is_institution()
  or (private.current_user_role() = 'mentor' and (visibility = 'all' or author_id = auth.uid()))
);
-- 작성: 넥스트랩·멘토 (작성자 = 본인)
create policy board_posts_insert on public.board_posts for insert with check (
  author_id = auth.uid() and private.current_user_role() in ('nextlab', 'mentor')
);
-- 수정·삭제: 넥스트랩(모든 권한) 또는 작성자 본인
create policy board_posts_update on public.board_posts for update
  using (private.is_nextlab() or author_id = auth.uid())
  with check (private.is_nextlab() or author_id = auth.uid());
create policy board_posts_delete on public.board_posts for delete
  using (private.is_nextlab() or author_id = auth.uid());

-- 답변 열람: 부모 글이 열람 가능하면
create policy board_replies_select on public.board_replies for select using (
  private.is_nextlab()
  or private.is_institution()
  or exists (
    select 1 from public.board_posts p
    where p.id = post_id and (p.visibility = 'all' or p.author_id = auth.uid())
  )
);
-- 답변 작성: 넥스트랩·멘토, 열람 가능한 글에만
create policy board_replies_insert on public.board_replies for insert with check (
  author_id = auth.uid()
  and private.current_user_role() in ('nextlab', 'mentor')
  and (
    private.is_nextlab()
    or exists (
      select 1 from public.board_posts p
      where p.id = post_id and (p.visibility = 'all' or p.author_id = auth.uid())
    )
  )
);
create policy board_replies_delete on public.board_replies for delete
  using (private.is_nextlab() or author_id = auth.uid());
