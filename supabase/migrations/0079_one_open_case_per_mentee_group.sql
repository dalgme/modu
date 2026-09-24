-- 0079 (2026-09-24) P30 — 1멘티 = 1케이스(그룹당) DB 강제
-- 엑셀 재업로드·부분 재등록으로 같은 멘티에게 같은 그룹 케이스가 두 번 생기던 것을 막는다.
-- 중도 종료(withdrawn) 케이스는 제외 — 탈락 후 재등록(재배치)은 새 케이스로 허용.
create unique index if not exists cases_one_open_per_mentee_group
  on public.cases (mentee_id, support_type_id)
  where mentee_id is not null and status <> 'withdrawn';
