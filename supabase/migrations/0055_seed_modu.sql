-- ============================================================================
-- 0055_seed_modu.sql  (docs/MODU-DESIGN.md §0, §2-2, §6-1, §7-2, §17)
-- 모두의창업 초기 데이터. 기관명·단가·한도·회차는 전부 운영 설정 페이지에서 바꿀 수 있다 — 여기 값은 출발점.
-- 사용자 계정은 넣지 않는다 (플랫폼 관리자는 /api/setup, 나머지는 화면에서 발급).
-- ============================================================================

-- 1) 행사
insert into public.programs (
  slug, name, status, client_name, client_short, client_seal_name,
  operator_name, operator_short, app_title, sms_footer, email_subject_prefix,
  default_withholding_method, default_required_rounds
) values (
  'modu-2026', '모두의창업', 'active',
  '세종창조경제혁신센터', '센터', '세종창조경제혁신센터장',
  '(주)렛츠', '렛츠', '모두의창업 운영관리', '-모두의창업', '[모두의창업]',
  'other_income', 4
);

-- 2) 사업그룹 A~D (회차 수 기본 4 — 설정 페이지에서 그룹별 조정)
insert into public.support_types (program_id, code, name, description, required_rounds, sort_order, predecessor_support_type_id)
select p.id, g.code, g.name, g.description, 4, g.sort_order, null
from public.programs p
cross join (values
  ('modu-1-2',    'A그룹 · 1기 2라운드', '모두의창업 1기 2라운드', 1),
  ('modu-2-1',    'B그룹 · 2기 1라운드', '모두의창업 2기 1라운드', 2),
  ('modu-2-2',    'C그룹 · 2기 2라운드', '모두의창업 2기 2라운드', 3),
  ('modu-2-drop', 'D그룹 · 2기 탈락자',  '모두의창업 2기 탈락자 그룹', 4)
) as g(code, name, description, sort_order)
where p.slug = 'modu-2026';

-- 승계 관계 예시: 2기 1라운드 → 2기 2라운드 (운영 설정에서 변경 가능)
update public.support_types c
set predecessor_support_type_id = b.id
from public.support_types b
where c.code = 'modu-2-2' and b.code = 'modu-2-1' and c.program_id = b.program_id;

-- 3) 단가 (행사 기본): 온라인 80,000 / 1일 240,000 · 오프라인 100,000 / 1일 300,000
insert into public.consulting_rates (program_id, support_type_id, mode, unit_price, daily_cap_amount, effective_from)
select p.id, null, r.mode::public.consulting_mode, r.unit_price, r.daily_cap, date '2026-01-01'
from public.programs p
cross join (values ('online', 80000, 240000), ('offline', 100000, 300000)) as r(mode, unit_price, daily_cap)
where p.slug = 'modu-2026';

-- 4) 운영 한도 (행사 기본): 멘토 1일 3건, 같은 멘티 1일 3회
insert into public.operating_limits (program_id, support_type_id, mentor_daily_case_limit, case_daily_round_limit, effective_from)
select p.id, null, 3, 3, date '2026-01-01' from public.programs p where p.slug = 'modu-2026';

-- 5) 만족도 표준양식 (행사 공통 v1): 5점 척도 5문항 + 주관식 1문항
insert into public.survey_templates (program_id, support_type_id, name, version, is_active)
select p.id, null, '표준 만족도 조사', 1, true from public.programs p where p.slug = 'modu-2026';

insert into public.survey_questions (template_id, sort_order, qtype, label, options, required)
select t.id, q.sort_order, q.qtype, q.label, q.options::jsonb, q.required
from public.survey_templates t
join public.programs p on p.id = t.program_id and p.slug = 'modu-2026' and t.support_type_id is null and t.version = 1
cross join (values
  (1, 'scale', '멘토의 전문성에 만족하셨습니까?',            '{"min":1,"max":5,"min_label":"매우 불만족","max_label":"매우 만족"}', true),
  (2, 'scale', '멘토의 성실성(약속·준비)에 만족하셨습니까?',   '{"min":1,"max":5,"min_label":"매우 불만족","max_label":"매우 만족"}', true),
  (3, 'scale', '컨설팅이 사업에 실질적으로 도움이 되었습니까?', '{"min":1,"max":5,"min_label":"전혀 아니다","max_label":"매우 그렇다"}', true),
  (4, 'scale', '멘토와의 의사소통은 원활했습니까?',          '{"min":1,"max":5,"min_label":"매우 불만족","max_label":"매우 만족"}', true),
  (5, 'scale', '다음 기회에도 이 멘토와 함께하고 싶습니까?',   '{"min":1,"max":5,"min_label":"전혀 아니다","max_label":"매우 그렇다"}', true),
  (6, 'text',  '개선 의견이나 하고 싶은 말을 자유롭게 적어 주세요.', 'null', false)
) as q(sort_order, qtype, label, options, required);

-- 6) 키워드 사전 초기값 (자유 입력도 허용 — 자동완성용)
insert into public.tag_catalog (program_id, category, label, sort_order)
select p.id, c.category, c.label, c.sort_order
from public.programs p
cross join (values
  ('stage', '예비창업', 1), ('stage', '초기창업(3년 미만)', 2), ('stage', '성장기', 3),
  ('need', '사업계획서', 1), ('need', '마케팅·브랜딩', 2), ('need', '재무·투자유치', 3), ('need', '법무·지식재산', 4),
  ('need', '제품·서비스 개발', 5), ('need', '온라인 판로', 6), ('need', '조직·인사', 7),
  ('region', '세종', 1), ('region', '대전·충청', 2), ('region', '수도권', 3), ('region', '기타', 4)
) as c(category, label, sort_order)
where p.slug = 'modu-2026';

-- 7) 플랫폼 공통 설정 문구는 플레이스홀더만 (기관명 리터럴 금지 — §17-4)
update public.app_settings
set value = '[{program}] {mentor} 멘토님, 이번 주에도 [{companies}] 멘티의 컨설팅 회차 등록과 보고서 작성을 부탁드립니다.'
where key = 'mentor_weekly_reminder_template' and program_id is null;
update public.app_settings set value = 'false'
where key = 'mentor_weekly_reminder_enabled' and program_id is null;
