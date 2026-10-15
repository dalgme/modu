-- 0091 (2026-10-15) 그룹별 관찰의견서 제출 여부 — 1기 2라운드는 관찰의견서 없이 회차 보고서만으로 종결한다(사용자 결정).
-- false 면 멘토 화면의 관찰의견서 제출란이 사라지고, 종결 요청·검수 승인·검수 대기열 판정에서 관찰의견서를 요구하지 않는다.
alter table public.support_types add column if not exists observation_required boolean not null default true;
comment on column public.support_types.observation_required is '이 그룹 멘토가 종결 전에 관찰의견서를 제출해야 하는가 (false = 관찰의견서 없이 회차 보고서만으로 종결 요청·검수 승인)';
-- 1기 2라운드(시드 코드 modu-1-2)는 관찰의견서 불필요
update public.support_types set observation_required = false where code = 'modu-1-2';
