-- P27 (2026-09-23)
-- 1) 멘티 순위 (별도 엑셀 업로드로 갱신, 멘티 명단·매칭 리스트 정렬·표시)
alter table public.mentee_profiles add column if not exists rank integer;
comment on column public.mentee_profiles.rank is '멘티 순위 — 운영사가 별도 엑셀(멘티명·순위)로 업로드. null = 미지정';

-- 2) 매칭 방식 — 배정이 어떻게 확정됐는지 (자동: 멘티 재배치 희망 / 추천: 자동 추천 매칭 확정 / 수동: 운영자 멘토 검색)
alter table public.mentor_assignments add column if not exists match_method text
  check (match_method in ('auto_preferred', 'recommended', 'manual'));
comment on column public.mentor_assignments.match_method is 'auto_preferred=자동(멘티 희망) · recommended=추천 · manual=수동';

-- 백필: 감사로그로 방식 복원 (match.auto_assign → 자동, match.adoption → 추천, 나머지 → 수동)
update public.mentor_assignments ma set match_method = coalesce((
  select case al.action when 'match.auto_assign' then 'auto_preferred' when 'match.adoption' then 'recommended' end
  from public.audit_logs al
  where al.entity_id = ma.case_id and al.action in ('match.auto_assign', 'match.adoption')
    and (al.metadata->>'mentor_id') = ma.mentor_id::text
  order by al.created_at desc limit 1
), 'manual')
where ma.match_method is null;
