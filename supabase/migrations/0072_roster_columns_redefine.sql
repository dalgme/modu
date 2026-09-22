-- P23 멘토·멘티 정보 컬럼 재정의 (2026-09-22)
--  멘토: 이름·소속·휴대폰·이메일·분야(최대10)·직위·소속멘토기관·권역·비고
--  멘티: 이름·닉네임·고유번호·휴대폰·이메일·권역·유형·아이디어·희망분야(최대6)·재배치 희망(멘토 이름)·비고
--  기존 필드 매핑: 분야→mentor_profiles.expertise / 권역→mentor_profiles.regions·mentee_profiles.region
--  희망분야→mentee_profiles.needs / 아이디어→cases.item / 소속→users.organization / 직위→users.position

alter table public.mentor_profiles add column mentor_institution text;
alter table public.mentor_profiles add column note text;

alter table public.mentee_profiles add column nickname text;
alter table public.mentee_profiles add column external_no text;
alter table public.mentee_profiles add column mentee_type text;
alter table public.mentee_profiles add column preferred_mentor text;
alter table public.mentee_profiles add column note text;

comment on column public.mentor_profiles.mentor_institution is '소속멘토기관 (소속 회사와 별도)';
comment on column public.mentor_profiles.note is '비고 (운영사 메모)';
comment on column public.mentee_profiles.nickname is '닉네임 (팀명·활동명 — cases.business_name 과 동기)';
comment on column public.mentee_profiles.external_no is '고유번호 (공고·명부 상 식별번호)';
comment on column public.mentee_profiles.mentee_type is '유형 (예비창업·기창업 등 자유 텍스트)';
comment on column public.mentee_profiles.preferred_mentor is '재배치 희망여부 — 희망 멘토 이름 (비어 있으면 희망 없음)';
comment on column public.mentee_profiles.note is '비고 (운영사 메모)';
