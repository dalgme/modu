-- 0030: audit_logs INSERT 정책 강화 — 감사기록 위조(다른 사용자 actor_id 사칭) 차단.
--  기존: with check (auth.uid() is not null) → 아무 로그인 사용자가 임의 actor_id 로 삽입 가능.
--  변경: actor_id = auth.uid() 로 제한 → 본인 명의로만 기록 가능.
--  (service_role 로 쓰는 서버측 logAudit/admin 경로는 RLS 우회라 영향 없음)

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs for insert
  with check (actor_id = auth.uid());
