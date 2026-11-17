-- (2026-11-17) 멘토 요청 분류 — 멘토 변경(재배정) / 중도 종결(검수로)
-- mentor_withdrawal_requests.kind: 'reassign' = 멘토 변경 요청(승인 시 부분 정산 + 재배정 대기 — 기존 동작)
--                                   'early_closure' = 중도 종결 요청(승인 시 남은 회차 없이 검수 대기로)
alter table public.mentor_withdrawal_requests
  add column if not exists kind text not null default 'reassign';
alter table public.mentor_withdrawal_requests drop constraint if exists mentor_withdrawal_requests_kind_check;
alter table public.mentor_withdrawal_requests
  add constraint mentor_withdrawal_requests_kind_check check (kind in ('reassign', 'early_closure'));
comment on column public.mentor_withdrawal_requests.kind is 'reassign = 멘토 변경 요청(재배정) · early_closure = 중도 종결 요청(검수)';

-- 처리 대기 중이던 구 '중도 종료 요청'은 사유가 모두 멘토링 자체를 끝내는 내용 → 중도 종결로 분류
update public.mentor_withdrawal_requests set kind = 'early_closure' where status = 'pending';

-- 중도 종결 승인 표시 — 이 값이 있으면 검수 승인 기준 회차 = 보고서까지 등록된 회차(필수 회차 미달 허용), 관찰의견서 면제
alter table public.cases add column if not exists early_closure_at timestamptz;
comment on column public.cases.early_closure_at is '멘토 중도 종결 요청 승인 시각 — 검수 승인 시 등록된 회차만으로 종결';
