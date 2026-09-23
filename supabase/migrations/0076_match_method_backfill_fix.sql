-- P28 (2026-09-23) — 0075 백필 보정.
-- P27 이전의 match.adoption 감사로그는 케이스 상세의 모든 배정/재배정(추천 채택이 아니어도 recommended_rank=null)에 남았다.
-- recommended_rank 가 없는 채택 기록만 있는 배정은 '수동'으로 되돌린다. (P27 이후 배정은 assignMentor 가 방식을 직접 기록하므로 영향 없음)
update public.mentor_assignments ma
set match_method = 'manual'
where ma.match_method = 'recommended'
  and not exists (
    select 1 from public.audit_logs al
    where al.entity_id = ma.case_id
      and al.action = 'match.adoption'
      and al.metadata->>'mentor_id' = ma.mentor_id::text
      and al.metadata->>'recommended_rank' is not null
  );
