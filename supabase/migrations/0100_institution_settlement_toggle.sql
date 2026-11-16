-- 0100 (2026-11-16) 라운드별 "발주처 [정산 품의] 기능" 스위치
-- 기본 꺼짐: 운영사가 검수 → 정산 품의 확인(정산 확인) → 지급 완료 · 수당 산출내역 다운로드를 모두 진행한다.
-- 켠 라운드의 정산이 든 품의만 발주처가 [정산 확인]·[반려] 한다(발주처 알림도 그 품의만).
alter table public.support_types
  add column if not exists institution_settlement_enabled boolean not null default false;

comment on column public.support_types.institution_settlement_enabled is
  '발주처 [정산 품의] 기능 사용 — true 인 라운드의 정산이 든 품의는 발주처가 정산 확인. 기본 false(운영사가 정산 확인).';
