-- 0065 (2026-09-09) P14 — 위촉 서식 그룹별 설정 + 업로드 방식 표준양식 파일
--  - mentor_form_settings.support_type_id: null = 행사 공통, 값 = 그 사업그룹 전용 override.
--    멘토에게는 "소속 그룹 설정 → 행사 공통" 순으로 해석된다 (그룹 행이 있으면 enabled=false 도 명시적 off).
--  - template_path/name: 수령 방식이 파일 첨부일 때 운영사가 올리는 표준양식 파일 —
--    멘토가 다운로드해 작성한 뒤 업로드한다. (documents 버킷 mentor-form-templates/ 경로, 접근은 서명 URL)

alter table public.mentor_form_settings
  add column support_type_id uuid references public.support_types (id) on delete cascade,
  add column template_path text,
  add column template_name text;

alter table public.mentor_form_settings drop constraint mentor_form_settings_program_id_form_key_key;
create unique index mentor_form_settings_scope_key
  on public.mentor_form_settings (program_id, coalesce(support_type_id, '00000000-0000-0000-0000-000000000000'::uuid), form_key);
