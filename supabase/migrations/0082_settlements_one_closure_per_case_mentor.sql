-- (P31) 정산 유니크 규칙 개정: 케이스 × 멘토당 closure 는 1건, partial 은 여러 건 허용.
--  종료된 멘토의 부분 정산을 취소한 뒤 다시 확정하거나(resettlePartial), 중도 종료 → 복귀 → 재종료처럼
--  같은 멘토의 부분 정산이 두 번 생길 수 있다. 같은 회차의 이중 정산은 mentoring_logs.settlement_id 잠금이 막는다.
drop index if exists public.settlements_case_mentor_key;
create unique index settlements_one_closure_per_case_mentor
  on public.settlements (case_id, mentor_id)
  where status <> 'canceled' and kind = 'closure';
