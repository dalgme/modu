-- 2026-10-23: 라운드(사업그룹)별 멘토 희망 멘티 수.
-- 운영사가 라운드마다 "멘토명·전화번호·이메일·희망 멘티 수" 엑셀을 올려 채운다. 매칭 수동 검색 팝업에 표시(배정 정원 게이트는 아님).
-- 값만 저장하는 행은 그룹 지정(is_active)을 만들지 않는다 — 없으면 is_active=false 행으로 넣는다(원천징수 override 와 같은 규칙).
alter table public.support_type_members add column if not exists desired_mentees integer;
alter table public.support_type_members drop constraint if exists support_type_members_desired_mentees_check;
alter table public.support_type_members add constraint support_type_members_desired_mentees_check check (desired_mentees is null or desired_mentees between 0 and 99);
comment on column public.support_type_members.desired_mentees is '이 라운드에서 멘토가 희망하는 멘티 수 (엑셀 업로드, 표시용 — 정원 게이트는 support_types.max_mentees_per_mentor)';
