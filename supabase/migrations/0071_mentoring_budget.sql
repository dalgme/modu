-- 0071 (2026-09-21) P22 — 멘토링 예산 관리
--  행사 전체·사업그룹별 멘토링 예산(지급총액 gross 기준). null = 미설정(게이지 숨김).
--  집행률 = (확정 정산 gross 합 + 이행 회차 예상액 합) / 예산 — 계산은 src/lib/reports/budget.ts 한 곳.

alter table public.programs add column mentoring_budget numeric check (mentoring_budget is null or mentoring_budget >= 0);
alter table public.support_types add column mentoring_budget numeric check (mentoring_budget is null or mentoring_budget >= 0);
