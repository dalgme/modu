-- 0067 (2026-09-17) P16 — 운영사 총괄담당자 셀프 등록 확인코드
--  programs.operator_signup_code: 이 코드를 아는 사람이 /register/operator 에서
--  아이디(이메일)·비밀번호를 직접 정해 그 행사의 운영사 총괄담당자(PL)로 등록된다.
--  null/빈값 = 셀프 등록 닫힘. 코드 변경·해제는 플랫폼 콘솔 행사 개설정보 수정에서.

alter table public.programs add column operator_signup_code text;
update public.programs set operator_signup_code = 'letsedu0902' where status = 'active';
