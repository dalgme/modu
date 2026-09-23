-- P28 (2026-09-23) — 배정 부수효과로 생긴 암묵적 그룹 지정 해제.
-- ensureGroupRoster 가 배정 시 support_type_members.is_active=true 로 올려 "지정 없음 = 모든 그룹 후보"(P25) 규칙을 깨고 있었다.
-- 운영사가 명시적으로 지정한 기록(audit mentor.group_assign)이 없는 행은 전부 비활성(지정 아님)으로 되돌린다. 원천징수 override 는 그대로 남는다.
update public.support_type_members stm
set is_active = false
where stm.member_role = 'mentor'
  and stm.is_active = true
  and not exists (
    select 1 from public.audit_logs al
    where al.action = 'mentor.group_assign'
      and al.entity_id = stm.user_id
      and al.metadata->>'support_type_id' = stm.support_type_id::text
  );
