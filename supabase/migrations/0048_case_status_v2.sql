-- ============================================================================
-- 0048_case_status_v2.sql  (docs/MODU-DESIGN.md §3)
-- case_status enum 전면 교체(원본 15개 → v2 10개), cases 정리(폐업정리·보조금 컬럼 삭제, 행사 소속·승계),
-- mentor_assignments 종료 사유(자진/강제·열람 범위), 멘토 자진 중도 종료 요청, 행사 범위 RLS.
-- 새 DB(0행) 전제 — using 절의 상태 매핑은 형식상 넣는다.
-- ============================================================================

-- 1) 상태 enum v2
create type public.case_status_v2 as enum (
  'registered',            -- 멘티 등록
  'mentor_assigned',       -- 멘토 배정
  'in_progress',           -- 컨설팅 진행 중 (1회차 등록 시)
  'reassignment_pending',  -- 멘토 중도 종료 → 재배정 대기
  'closure_requested',     -- 관찰의견서 제출 · 종결 요청 (멘토)
  'revision_requested',    -- 렛츠 보완 요청
  'settlement_pending',    -- 렛츠 검수 승인 + 정산 확정 = 지급 대기
  'settlement_batched',    -- 지급 품의 편성
  'closed',                -- 센터 정산 확인 = 종결 확정
  'withdrawn'              -- 멘티 중도 종료
);

alter table public.cases alter column status drop default;
alter table public.cases
  alter column status type public.case_status_v2
  using (case status::text
           when 'registered' then 'registered'
           when 'mentor_assigned' then 'mentor_assigned'
           when 'withdrawn' then 'withdrawn'
           else 'in_progress' end)::public.case_status_v2;
alter table public.case_status_history
  alter column from_status type public.case_status_v2
  using (case from_status::text
           when 'registered' then 'registered'
           when 'mentor_assigned' then 'mentor_assigned'
           when 'withdrawn' then 'withdrawn'
           else 'in_progress' end)::public.case_status_v2,
  alter column to_status type public.case_status_v2
  using (case to_status::text
           when 'registered' then 'registered'
           when 'mentor_assigned' then 'mentor_assigned'
           when 'withdrawn' then 'withdrawn'
           else 'in_progress' end)::public.case_status_v2;
drop type public.case_status;
alter type public.case_status_v2 rename to case_status;
alter table public.cases alter column status set default 'registered';

-- 2) cases 정리
alter table public.cases
  drop column if exists closure_status,
  drop column if exists closed_at,
  drop column if exists revenue_last_year,
  drop column if exists lease_deposit,
  drop column if exists monthly_rent,
  drop column if exists exclusive_area_pyeong,
  drop column if exists pre_support_submitted_at,
  drop column if exists post_support_submitted_at;
drop type if exists public.closure_status;

alter table public.cases
  alter column business_reg_no drop not null,   -- 예비창업자는 사업자번호가 없을 수 있다
  alter column address drop not null,
  add column program_id uuid not null references public.programs (id) on delete restrict,
  add column predecessor_case_id uuid references public.cases (id) on delete set null,
  add column closed_at timestamptz,             -- 종결 확정 시각 (closed)
  add column withdrawn_at timestamptz,
  add column withdrawn_reason text;
create index cases_program_status_idx on public.cases (program_id, status);
create index cases_predecessor_idx on public.cases (predecessor_case_id) where predecessor_case_id is not null;

-- cases.program_id 는 support_types.program_id 와 항상 같아야 한다 (비우면 자동 채움, 다르면 거부)
create or replace function private.enforce_case_program()
returns trigger language plpgsql set search_path = public as $$
declare st_program uuid;
begin
  select program_id into st_program from public.support_types where id = new.support_type_id;
  if st_program is null then
    raise exception 'support_type % not found', new.support_type_id;
  end if;
  if new.program_id is null then
    new.program_id := st_program;
  elsif new.program_id <> st_program then
    raise exception 'cases.program_id (%) must match support_types.program_id (%)', new.program_id, st_program;
  end if;
  return new;
end;
$$;
create trigger cases_enforce_program before insert or update of support_type_id, program_id on public.cases
  for each row execute function private.enforce_case_program();

-- 3) mentor_assignments 종료 사유 (자진/강제)
alter table public.mentor_assignments
  add column ended_at timestamptz,
  add column ended_by uuid references public.users (id) on delete set null,
  add column end_kind text check (end_kind in
    ('reassigned', 'recalled', 'mentor_withdrawal', 'forced', 'case_withdrawn', 'case_closed')),
  add column end_reason text,
  -- 'staff_only' = 운영사·발주처만 사유 열람 (강제 종료). 멘토·멘티 화면에는 사유를 내보내지 않는다.
  add column reason_visibility text not null default 'all' check (reason_visibility in ('all', 'staff_only'));

-- 4) 멘토 자진 중도 종료 요청 (T11a) — 강제 종료(T11b)는 배정 행에 직접 기록
create table public.mentor_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  assignment_id uuid not null references public.mentor_assignments (id) on delete cascade,
  mentor_id uuid not null references public.users (id) on delete restrict,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mentor_withdrawal_requests_case_idx on public.mentor_withdrawal_requests (case_id, status);
create trigger mentor_withdrawal_requests_set_updated_at before update on public.mentor_withdrawal_requests
  for each row execute function public.set_updated_at();

-- 5) 헬퍼: 케이스의 행사, 케이스 접근(행사 스태프 기준으로 재정의)
create or replace function private.case_program(cid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select program_id from public.cases where id = cid;
$$;

create or replace function private.can_access_case(target_case_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.is_program_staff(private.case_program(target_case_id))
      or private.is_mentor_of(target_case_id)
      or private.is_mentee_of(target_case_id);
$$;

-- 6) RLS — 행사 범위로 재정의
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select
  using (private.is_program_staff(program_id) or mentee_id = auth.uid() or private.is_mentor_of(id));
drop policy if exists cases_insert on public.cases;
create policy cases_insert on public.cases for insert
  with check (private.is_program_nextlab(program_id));
drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases for update
  using (private.is_program_staff(program_id) or private.is_mentor_of(id))
  with check (private.is_program_staff(program_id) or private.is_mentor_of(id));

drop policy if exists mentor_assignments_select on public.mentor_assignments;
create policy mentor_assignments_select on public.mentor_assignments for select
  using (mentor_id = auth.uid() or private.is_program_staff(private.case_program(case_id)));
drop policy if exists mentor_assignments_write on public.mentor_assignments;
create policy mentor_assignments_write on public.mentor_assignments for all
  using (private.is_program_nextlab(private.case_program(case_id)))
  with check (private.is_program_nextlab(private.case_program(case_id)));

alter table public.mentor_withdrawal_requests enable row level security;
create policy mentor_withdrawal_requests_select on public.mentor_withdrawal_requests for select
  using (mentor_id = auth.uid() or private.is_program_staff(private.case_program(case_id)));
create policy mentor_withdrawal_requests_insert on public.mentor_withdrawal_requests for insert
  with check (mentor_id = auth.uid() and private.is_mentor_of(case_id));
create policy mentor_withdrawal_requests_update on public.mentor_withdrawal_requests for update
  using (private.is_program_nextlab(private.case_program(case_id)))
  with check (private.is_program_nextlab(private.case_program(case_id)));

-- notifications / audit_logs / reviews / mentoring_logs 등 is_staff() 기반 정책은
-- can_access_case 재정의로 행사 범위가 반영된다. 스태프 전역 조회(notifications_select 등)는 0053 에서 손본다.
