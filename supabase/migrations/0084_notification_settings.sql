-- 0084 (P32) 행사별 알림 이벤트 on/off
-- programs.notification_settings = { "<trigger_event>": false } — 그 이벤트 알림을 큐에 넣지 않는다(문자·알림톡 미발송).
-- 키가 없거나 true 면 발송(기본). 화면 안 알림 카드(대시보드·할 일)는 영향받지 않는다.
-- 로그인 안내 등 직발송 문자(sendSms 직접 호출)는 큐를 거치지 않으므로 이 설정과 무관하다.
alter table public.programs
  add column if not exists notification_settings jsonb not null default '{}'::jsonb;

comment on column public.programs.notification_settings is
  '(P32) 알림 이벤트별 on/off — { "<trigger_event>": false } 이면 그 이벤트 알림 미발송(문자·알림톡). 키 없음/true = 발송. 키 목록은 src/lib/notifications/templates.ts NOTIFICATION_EVENT_DEFS';
