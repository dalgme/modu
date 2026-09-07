-- 문자 예약 발송 + 앱 설정(주간 멘토 자동 안내문 템플릿)

-- 1) 앱 설정 key/value 저장소 (편집형 문구 등 운영 설정)
create table public.app_settings (
  key text primary key,
  value text not null default '',
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
-- 운영진(진흥원·넥스트랩) 열람, 넥스트랩만 편집
create policy app_settings_select on public.app_settings for select using (private.is_staff());
create policy app_settings_write_nextlab on public.app_settings for all
  using (private.is_nextlab()) with check (private.is_nextlab());

-- 2) 문자 예약 발송 큐 (즉시/예약 중 '예약'을 저장 → cron 이 예약시각 도달 시 발송)
create table public.scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  sender_index smallint not null default 1,
  recipient_ids uuid[] not null default '{}',
  recipient_count integer not null default 0,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'canceled', 'failed')),
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  dispatched_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scheduled_messages_due_idx on public.scheduled_messages (scheduled_at)
  where status = 'pending';
create trigger scheduled_messages_set_updated_at before update on public.scheduled_messages
  for each row execute function public.set_updated_at();

alter table public.scheduled_messages enable row level security;
create policy scheduled_messages_select on public.scheduled_messages for select using (private.is_staff());
create policy scheduled_messages_write_nextlab on public.scheduled_messages for all
  using (private.is_nextlab()) with check (private.is_nextlab());

-- 3) 주간 멘토 자동 안내문 기본 템플릿 시드
--    {mentor} = 멘토 성명, {companies} = 지원신청서 미완료 멘티기업명 목록(쉼표 구분)
insert into public.app_settings (key, value) values
  (
    'mentor_weekly_reminder_template',
    '[재기지원사업] {mentor}멘토님, 이번주에도 [{companies}] 기업에 대한 재기지원 컨설팅/지원신청서 작성 진행 잘 부탁드리겠습니다'
  ),
  ('mentor_weekly_reminder_enabled', 'true')
on conflict (key) do nothing;
