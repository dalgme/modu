-- 0070 (2026-09-21) P20 — 케이스 만족도 조사 개시·리마인드 기록
--  survey_opened_at: 목표 회차(그룹 required_rounds) 보고서 등록 완료 시 자동, 또는 운영사 [만족도 생성] 버튼.
--  멘티 노출 조건 = survey_opened_at 있음 OR 종결 요청 이상 상태(기존 규칙 유지).
--  survey_reminded_at: 개시 1주일 미응답 자동 리마인드 문자 발송 기록 (1회).

alter table public.cases
  add column survey_opened_at timestamptz,
  add column survey_reminded_at timestamptz;
