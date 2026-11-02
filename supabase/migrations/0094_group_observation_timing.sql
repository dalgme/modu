-- 0094 (2026-11-02) 그룹(라운드)별 관찰의견서 제출 시점
--   after_rounds = 계획 회차 보고서를 모두 올린 뒤에 업로드 열림 (기존 동작, P37)
--   anytime      = 회차 진행 중 언제든 업로드 (2기 요청 — 관찰의견서와 종결 요청 분리)
-- 종결 요청은 어느 쪽이든 모든 회차 보고서 등록 후에만 열린다(checkClosureReadiness).
alter table public.support_types
  add column if not exists observation_upload_timing text not null default 'after_rounds'
  check (observation_upload_timing in ('after_rounds', 'anytime'));

comment on column public.support_types.observation_upload_timing is
  '관찰의견서 업로드 시점: after_rounds = 계획 회차 보고서 전부 등록 후 / anytime = 언제든 (종결 요청은 항상 전 회차 보고서 후)';

-- 2기 라운드(모두의창업 충청권 B·C·D)는 언제든 제출
update public.support_types set observation_upload_timing = 'anytime'
 where code in ('modu-2-1', 'modu-2-2', 'modu-2-drop');
