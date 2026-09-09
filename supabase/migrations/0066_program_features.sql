-- 0066 (2026-09-09) P15 — 행사별 플랫폼 기능 플래그
--  programs.features jsonb: 플랫폼 통합관리자만 켜고 끄는 기능 스위치. 키가 없거나 false = 비활성.
--  현재 키: mentor_forms (책임멘토 위촉 서식 4종) — 주민등록번호 보관 등 개인정보 보완이 끝날 때까지
--  기본 비활성. 비활성이면 운영사 설정 탭·멘토 화면·집계에 노출되지 않고 서버 액션도 차단된다.

alter table public.programs add column features jsonb not null default '{}'::jsonb;
