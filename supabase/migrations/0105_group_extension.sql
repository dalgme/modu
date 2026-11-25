-- (2026-11-25) 라운드 연장 선정 — "1기 3라운드" 진출자는 별도 라운드(케이스)가 아니라 1기 2라운드 케이스의 연장으로 멘토링을 더 받는다.
--  · 그룹 설정: 연장 이름(예: '1기 3라운드') · 선정자 추가 시간(예: 3) · 선정자 총 시간 상한(예: 15). extension_label 이 비어 있으면 기능 없음.
--  · 케이스: 선정 시각·선정자·선정 전 단계(해제할 때 되돌리기용).
--  선정된 케이스만 회차를 (필수 회차 + 승인 추가 + 추가 시간 수)까지 더 등록할 수 있고, 모든 회차의 운영시간 합계가 총 시간 상한을 넘을 수 없다.
alter table public.support_types
  add column if not exists extension_label text,
  add column if not exists extension_extra_hours integer not null default 0 check (extension_extra_hours between 0 and 50),
  add column if not exists extension_total_hours integer check (extension_total_hours is null or extension_total_hours between 1 and 200);

alter table public.cases
  add column if not exists extension_selected_at timestamptz,
  add column if not exists extension_selected_by uuid references public.users(id) on delete set null,
  add column if not exists extension_prev_status text;

comment on column public.support_types.extension_label is '라운드 연장 이름(예: 1기 3라운드). 비어 있으면 연장 선정 기능 없음';
comment on column public.support_types.extension_extra_hours is '연장 선정자 추가 멘토링 시간(시간) — 추가로 등록할 수 있는 회차 칸 수';
comment on column public.support_types.extension_total_hours is '연장 선정자 총 멘토링 시간 상한(시간, 모든 회차 운영시간 합계)';
comment on column public.cases.extension_selected_at is '라운드 연장(예: 1기 3라운드) 선정 시각 — null 이면 미선정';
comment on column public.cases.extension_prev_status is '연장 선정으로 다시 연 케이스의 선정 전 단계(해제 시 되돌리기)';

-- 1기 2라운드(A그룹) = 1기 3라운드 진출자 연장: 추가 3시간, 총 15시간
update public.support_types
   set extension_label = '1기 3라운드', extension_extra_hours = 3, extension_total_hours = 15
 where code = 'modu-1-2';
