-- P25 (2026-09-23)
--  1) 매칭 규칙: 라운드(사업그룹)별 멘토 1인당 최대 멘티 수 — 기본 2명 (운영 설정에서 그룹별 변경)
--  2) 지급서류 수령 상태 O/X — 기존 *_received_at(O 시각)에 명시적 상태 컬럼 추가 (null = '-')

alter table public.support_types
  add column max_mentees_per_mentor integer not null default 2 check (max_mentees_per_mentor between 1 and 50);
comment on column public.support_types.max_mentees_per_mentor is '이 라운드에서 멘토 1인당 동시 배정 가능한 최대 멘티 수 (매칭 규칙)';

alter table public.mentor_payment_docs
  add column resume_state text check (resume_state in ('O', 'X')),
  add column bankbook_state text check (bankbook_state in ('O', 'X')),
  add column id_card_state text check (id_card_state in ('O', 'X'));
comment on column public.mentor_payment_docs.resume_state is '수령 상태 O/X (null = 미확인 -)';

-- 기존 수령 체크는 O 로 백필
update public.mentor_payment_docs set resume_state = 'O' where resume_received_at is not null;
update public.mentor_payment_docs set bankbook_state = 'O' where bankbook_received_at is not null;
update public.mentor_payment_docs set id_card_state = 'O' where id_card_received_at is not null;
