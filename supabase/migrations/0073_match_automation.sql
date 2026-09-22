-- P24 자동 매칭 (2026-09-22)
--  - confirmed_at: 멘토가 로그인해 배정을 확인(열람)한 시각 — 매칭 리스트 '확인 여부'
--  - notice_sent_at: "전원 배정 완료" 시 멘토에게 보낸 로그인 안내 문자 발송 시각 (중복 발송 방지)

alter table public.mentor_assignments add column confirmed_at timestamptz;
alter table public.mentor_assignments add column notice_sent_at timestamptz;

comment on column public.mentor_assignments.confirmed_at is '멘토가 배정을 확인(플랫폼 열람)한 시각';
comment on column public.mentor_assignments.notice_sent_at is '전원 배정 완료 알림 문자 발송 시각';
