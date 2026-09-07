-- ============================================================================
-- 0056_docs_visibility_observation_sms.sql  (P3 + 추가 요건 2026-09-07)
--  1) documents.mentor_visible — 멘티 관련 서류의 멘토 공개/비공개 (멘토는 공개본만 조회)
--  2) observation_reports — 관찰의견서 웹 작성본 (PDF 는 documents 'observation_report' 단일본)
--  3) program_sms_settings — 행사별 문자 API 자격증명(봉투 암호화 저장, 클라이언트 조회 불가)
--  4) program_sms_access_log — 자격증명 사용/변경 이력
-- ============================================================================

-- 1) 멘토 공개 여부
alter table public.documents
  add column mentor_visible boolean not null default true,
  add column uploaded_role public.user_role;
create index documents_case_visible_idx on public.documents (case_id) where mentor_visible;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select
  using (
    private.is_program_staff(private.case_program(case_id))
    or private.is_mentee_of(case_id)
    or (private.is_mentor_of(case_id) and mentor_visible)
  );
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert
  with check (private.can_access_case(case_id));

-- 2) 관찰의견서 웹 작성본 (케이스당 1건 · 제출 시 PDF 생성 → documents 'observation_report')
create table public.observation_reports (
  case_id uuid primary key references public.cases (id) on delete cascade,
  mentor_id uuid not null references public.users (id) on delete restrict,
  content jsonb not null default '{}'::jsonb,        -- { summary, strengths, weaknesses, recommendations, next_steps, overall_rating }
  submitted_at timestamptz,                          -- 종결 요청 시각 (null = 임시저장)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger observation_reports_set_updated_at before update on public.observation_reports
  for each row execute function public.set_updated_at();
alter table public.observation_reports enable row level security;
create policy observation_reports_select on public.observation_reports for select
  using (private.can_access_case(case_id));
create policy observation_reports_write on public.observation_reports for all
  using (private.is_mentor_of(case_id) or private.is_program_staff(private.case_program(case_id)))
  with check (private.is_mentor_of(case_id) or private.is_program_staff(private.case_program(case_id)));

-- 3) 행사별 문자 API 자격증명 — 값은 앱 계층에서 AES-256-GCM(행사별 DEK) + KEK(환경변수) 봉투 암호화.
--    RLS 정책을 하나도 두지 않아 anon/authenticated 로는 어떤 행도 읽을 수 없다(service_role 전용).
create table public.program_sms_settings (
  program_id uuid primary key references public.programs (id) on delete cascade,
  provider text not null default 'solapi' check (provider in ('solapi')),
  enc_version integer not null default 1,
  dek_wrapped text not null,                 -- KEK 로 감싼 행사별 데이터 키 (base64)
  api_key_enc text not null,                 -- DEK 로 암호화 (iv.tag.ciphertext base64)
  api_secret_enc text not null,
  sender_number_enc text not null,
  sender_number_hint text not null,          -- 마스킹 표시용 뒷 4자리
  api_key_hint text not null,                -- 앞 4자리
  fingerprint text not null,                 -- HMAC(KEK, program_id|api_key|sender) — 변조 감지
  is_active boolean not null default true,
  verified_at timestamptz,                   -- 테스트 발송 성공 시각
  rotated_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger program_sms_settings_set_updated_at before update on public.program_sms_settings
  for each row execute function public.set_updated_at();
alter table public.program_sms_settings enable row level security;
-- (정책 없음 = 전면 차단. 서버(service_role)만 접근)

-- 4) 자격증명 접근 이력 (변경·조회·발송 사용) — 발주처/운영사 스태프 열람
create table public.program_sms_access_log (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  actor_id uuid references public.users (id) on delete set null,
  action text not null check (action in ('set', 'rotate', 'disable', 'reveal_hint', 'test_send', 'send_use', 'decrypt_fail', 'reauth_fail')),
  detail jsonb,
  created_at timestamptz not null default now()
);
create index program_sms_access_log_program_idx on public.program_sms_access_log (program_id, created_at desc);
alter table public.program_sms_access_log enable row level security;
create policy program_sms_access_log_select on public.program_sms_access_log for select
  using (private.is_program_staff(program_id));
