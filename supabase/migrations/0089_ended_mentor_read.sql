-- 0089 종결·중도 종료된 케이스의 마지막 담당 멘토 열람 (2026-10-01)
-- 배경: 종결 확정(batches.ts) / 중도 종료 시 mentor_assignments.is_active=false 가 되어
--       private.is_mentor_of() 기반 RLS 가 멘토의 열람을 전부 막았다 → 멘토 화면에서 종결 케이스가 사라짐.
-- 방침: 쓰기 권한(is_mentor_of / can_access_case 를 쓰는 INSERT·UPDATE 정책)은 그대로 두고,
--       "끝까지 담당한 멘토"(end_kind = case_closed | case_withdrawn) 에게 SELECT 전용 정책만 추가한다.
--       교체(재배정)로 빠진 멘토는 대상 아님 — 이후 다른 멘토의 진행 내용이 보이지 않게.

create or replace function private.was_final_mentor_of(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.mentor_assignments
     where case_id = target_case_id
       and mentor_id = auth.uid()
       and not is_active
       and end_kind in ('case_closed', 'case_withdrawn')
  );
$$;


create policy cases_select_ended_mentor on public.cases
  for select using (private.was_final_mentor_of(id));

create policy documents_select_ended_mentor on public.documents
  for select using (private.was_final_mentor_of(case_id) and mentor_visible);

create policy case_status_history_select_ended_mentor on public.case_status_history
  for select using (private.was_final_mentor_of(case_id));

create policy mentoring_logs_select_ended_mentor on public.mentoring_logs
  for select using (private.was_final_mentor_of(case_id));

create policy signatures_select_ended_mentor on public.signatures
  for select using (private.was_final_mentor_of(case_id));

create policy reviews_select_ended_mentor on public.reviews
  for select using (private.was_final_mentor_of(case_id));

create policy round_extension_requests_select_ended_mentor on public.round_extension_requests
  for select using (private.was_final_mentor_of(case_id));

create policy mentee_profiles_select_ended_mentor on public.mentee_profiles
  for select using (private.was_final_mentor_of(case_id));

create policy observation_reports_select_ended_mentor on public.observation_reports
  for select using (private.was_final_mentor_of(case_id));

create policy case_team_members_select_ended_mentor on public.case_team_members
  for select using (private.was_final_mentor_of(case_id));
