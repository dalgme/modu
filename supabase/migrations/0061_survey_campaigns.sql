-- 0061 (2026-09-08) 조사 캠페인 — 만족도 외에 사전선호도·중간 만족도 등 여러 [조사]를
-- 행사 전체 / 그룹별 / 개별 구성원 대상으로 일정을 정해 진행한다.
-- 응답 경로는 플랫폼 내 + 문자 링크(토큰) 두 가지이며, 대상자 스냅샷으로 미참여자를 항상 파악한다.

create table if not exists public.survey_campaigns (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  support_type_id uuid references public.support_types (id) on delete set null,
  template_id uuid not null references public.survey_templates (id) on delete restrict,
  title text not null,
  description text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'open' check (status in ('draft','open','closed')),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists survey_campaigns_program_idx on public.survey_campaigns (program_id, created_at desc);
create trigger survey_campaigns_set_updated_at before update on public.survey_campaigns
  for each row execute function public.set_updated_at();

-- 대상자 스냅샷 (생성 시점 확정 — 문자만으로 응답해도 미참여자를 알 수 있는 근거)
create table if not exists public.survey_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.survey_campaigns (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  phone text,
  role public.user_role not null,
  support_type_id uuid references public.support_types (id) on delete set null,
  token text not null unique,
  responded_at timestamptz,
  answers jsonb,
  score numeric,
  channel text check (channel in ('web','sms')),
  notify_count int not null default 0,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);
create index if not exists survey_campaign_targets_campaign_idx on public.survey_campaign_targets (campaign_id);
create index if not exists survey_campaign_targets_user_idx on public.survey_campaign_targets (user_id) where responded_at is null;

alter table public.survey_campaigns enable row level security;
alter table public.survey_campaign_targets enable row level security;
-- 스태프 열람 (쓰기·토큰 응답은 service_role 경로)
create policy survey_campaigns_select on public.survey_campaigns for select
  using (private.is_program_staff(program_id));
create policy survey_campaign_targets_select on public.survey_campaign_targets for select
  using (exists (select 1 from public.survey_campaigns c where c.id = campaign_id and private.is_program_staff(c.program_id))
         or user_id = auth.uid());
