-- P54: 라운드(사업그룹)별 매칭정보 공개 여부.
-- 감추기(false, 기본)인 그룹은 멘토가 자신에게 배정된 멘티를, 멘티가 담당 멘토를 화면에서 볼 수 없다.
-- 운영사가 매칭을 마친 뒤 운영 설정 › 매칭 공개에서 그룹 단위로 공개(true)로 전환한다.
alter table public.support_types add column if not exists matching_published boolean not null default false;
alter table public.support_types add column if not exists matching_published_at timestamptz;

comment on column public.support_types.matching_published is
  '매칭정보 공개 여부 (false = 감추기: 멘토·멘티 화면에 배정 정보 비노출. 운영 설정 › 매칭 공개에서 전환)';
comment on column public.support_types.matching_published_at is '마지막으로 매칭정보를 공개한 시각';

-- 진행 중인 라운드(활성 배정 또는 회차가 있는 그룹)는 지금처럼 보이도록 공개로 시작한다.
-- 배정했다가 모두 회수한 그룹(매칭 작업 중)은 감추기로 둔다.
update public.support_types st
   set matching_published = true,
       matching_published_at = now()
 where exists (
         select 1 from public.mentor_assignments a
           join public.cases c on c.id = a.case_id
          where c.support_type_id = st.id and a.is_active
       )
    or exists (
         select 1 from public.mentoring_logs l
           join public.cases c on c.id = l.case_id
          where c.support_type_id = st.id
       );
