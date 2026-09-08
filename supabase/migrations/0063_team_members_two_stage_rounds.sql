-- 0063 (2026-09-08) P12 — 멘티 팀 정보 + 회차 2단계(계획/실행 → 보고서)
--  - case_team_members: 멘티(개인 또는 팀)의 팀원 명단. 팀원이 멘토링에 참여할 수 있다.
--  - mentoring_logs.participants: 회차 참가자 스냅샷 jsonb [{name, role: 'representative'|'member'}]
--  - mentoring_logs.report_registered_at: 2단계(보고서) 등록 일시. null = 1단계(계획/실행)만 등록됨.
--    기존 회차는 등록과 동시에 보고서를 냈으므로 created_at 으로 백필.
--  - mentee_profiles.item_description: 아이템 설명 (아이템명은 cases.item)

create table public.case_team_members (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null,
  member_role text,                    -- 팀 내 역할/직책 (예: 기획, 개발)
  phone text,
  email text,
  is_representative boolean not null default false,   -- 팀 대표 (멘티 본인과 별개 인물일 수도 있어 별도 행)
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index case_team_members_case_idx on public.case_team_members (case_id);

alter table public.case_team_members enable row level security;
create policy case_team_members_select on public.case_team_members for select
  using (private.can_access_case(case_id));
-- 쓰기는 service_role(운영사 서버 액션)만

alter table public.mentoring_logs
  add column participants jsonb not null default '[]'::jsonb,
  add column report_registered_at timestamptz;
update public.mentoring_logs set report_registered_at = created_at;

alter table public.mentee_profiles add column item_description text;
