-- 0083 (2026-09-24) P32 — 멘토 서류 **수령 체크**로 전환 (위촉 서식 4종 직접 제출 기능 폐지)
--  사용자 결정: "동의서 4종을 직접 받는 방식은 하지 말고, 오프라인으로 수령한 사실을 체크해 놓는 기능으로.
--               그룹별로 수령 체크할 서류명을 등록/추가하고 그룹별 사용 여부도 설정."
--  - mentor_doc_checklists: 행사 공통(support_type_id null) 또는 그룹 override 의 서류명 목록 + 사용 여부.
--    해석 = 그룹 행 → 행사 공통 → 없음 (0065/0078 과 같은 표현식 유니크 → upsert 는 수동 select→update/insert).
--    items jsonb = [{ key: 'appointment', name: '위촉 동의서' }, ...] — key 는 안정 슬러그(이름을 바꿔도 유지).
--  - mentor_doc_receipts: 멘토 × 서류(key) 수령 사실. 스코프(support_type_id)는 그 멘토에게 적용된 체크리스트의 스코프.
--  - mentor_form_settings / mentor_form_submissions 삭제 (기능 비활성 상태였고 운영 데이터 없음).
--    스토리지 경로 관례 documents/mentor-forms/*, documents/mentor-form-templates/* 는 더 이상 쓰지 않는다.
--  - programs.features 의 'mentor_forms' 키 제거.
--  - 시드: 모든 행사에 행사 공통 체크리스트(enabled=false, 기본 서류 4종) — 운영사가 켜기 전까지는 아무 화면에도 나타나지 않는다.

-- 1) 체크리스트 (행사 공통 / 그룹 override)
create table public.mentor_doc_checklists (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  support_type_id uuid references public.support_types (id) on delete cascade,
  enabled boolean not null default true,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentor_doc_checklists_items_array check (jsonb_typeof(items) = 'array')
);
create unique index mentor_doc_checklists_scope_key
  on public.mentor_doc_checklists (program_id, coalesce(support_type_id, '00000000-0000-0000-0000-000000000000'::uuid));
create trigger mentor_doc_checklists_set_updated_at before update on public.mentor_doc_checklists
  for each row execute function public.set_updated_at();

-- 2) 수령 기록 (멘토 × 서류 key, 체크리스트 스코프별)
create table public.mentor_doc_receipts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  support_type_id uuid references public.support_types (id) on delete cascade,
  mentor_id uuid not null references public.users (id) on delete cascade,
  item_key text not null,
  received boolean not null default true,
  received_at timestamptz,
  received_by uuid references public.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index mentor_doc_receipts_scope_key
  on public.mentor_doc_receipts (program_id, coalesce(support_type_id, '00000000-0000-0000-0000-000000000000'::uuid), mentor_id, item_key);
create index mentor_doc_receipts_program_mentor_idx on public.mentor_doc_receipts (program_id, mentor_id);
create trigger mentor_doc_receipts_set_updated_at before update on public.mentor_doc_receipts
  for each row execute function public.set_updated_at();

-- 3) RLS — 조회는 행사 스태프(+ 멘토 본인의 수령 기록), 쓰기는 service_role(서버 액션)만 (mentor_payment_docs 와 같은 원칙)
alter table public.mentor_doc_checklists enable row level security;
alter table public.mentor_doc_receipts enable row level security;
create policy mentor_doc_checklists_select on public.mentor_doc_checklists for select
  using (private.is_program_staff(program_id) or private.program_role(program_id) = 'mentor');
create policy mentor_doc_receipts_select on public.mentor_doc_receipts for select
  using (mentor_id = auth.uid() or private.is_program_staff(program_id));

-- 4) 위촉 서식 기능 제거
drop table if exists public.mentor_form_submissions;
drop table if exists public.mentor_form_settings;
update public.programs set features = features - 'mentor_forms' where features ? 'mentor_forms';

-- 5) 시드 — 행사마다 행사 공통 체크리스트(꺼짐) + 기본 서류 4종
insert into public.mentor_doc_checklists (program_id, support_type_id, enabled, items)
select p.id, null, false,
       '[{"key":"appointment","name":"위촉 동의서"},{"key":"privacy","name":"개인정보 수집·이용 동의서"},{"key":"pledge","name":"서약서"},{"key":"precheck","name":"사전 확인서"}]'::jsonb
from public.programs p
where not exists (
  select 1 from public.mentor_doc_checklists c where c.program_id = p.id and c.support_type_id is null
);
