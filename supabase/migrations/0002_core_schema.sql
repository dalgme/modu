-- ============================================================================
-- 0002_core_schema.sql
-- 대전 재기지원사업 플랫폼 — 핵심 스키마 (17개 테이블 + enum + 인덱스)
-- 설계문서 10장 데이터 모델 기준.
-- RLS 정책은 0003_rls.sql, 시드는 0004_seed.sql 참조.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type user_role as enum ('institution', 'nextlab', 'mentor', 'mentee');

create type case_status as enum (
  'registered',
  'mentor_assigned',
  'contacted',
  'log_completed',
  'contractor_registered',
  'application_drafted',
  'reviewed',
  'approved',
  'rejected',
  'notified',
  'execution_docs_submitted',
  'payment_application_drafted',
  'payment_approved'
);

create type support_type_code as enum ('management_improvement', 'closure');
create type calc_method as enum ('fixed', 'area_cap');
create type closure_status as enum ('closed', 'pending');
create type signer_type as enum ('mentor', 'mentee', 'contractor');
create type review_result as enum ('approved', 'revision_requested');
create type approval_type as enum ('support', 'payment');
create type approval_result as enum ('approved', 'rejected');
create type notification_channel as enum ('alimtalk', 'sms');
create type notification_status as enum ('pending', 'sent', 'failed', 'fallback_sent');

-- ----------------------------------------------------------------------------
-- 공통 updated_at 자동 갱신 트리거 함수
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. users — 역할별 계정 (auth.users 와 1:1). 셀프가입 없음.
-- ----------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null,
  name text not null,
  phone text,
  email text,
  is_active boolean not null default true,
  -- 최초 로그인 시 임시 비밀번호 변경 강제 플래그
  must_change_password boolean not null default false,
  password_changed_at timestamptz,
  -- 멘티 초대·활성화·개인정보 동의
  invited_at timestamptz,
  activated_at timestamptz,
  privacy_agreed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index users_role_idx on public.users (role);
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. support_types — 지원유형별 한도·계산방식 (자격/정원 필드 없음)
-- ----------------------------------------------------------------------------
create table public.support_types (
  id uuid primary key default gen_random_uuid(),
  code support_type_code not null unique,
  name text not null,
  limit_amount numeric(14, 2) not null,
  calc_method calc_method not null,
  -- area_cap 방식일 때 평당 단가 (예: 200000)
  area_unit_price numeric(14, 2),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger support_types_set_updated_at before update on public.support_types
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. support_type_documents — 유형별 필수·조건부 서류 매핑
-- ----------------------------------------------------------------------------
create table public.support_type_documents (
  id uuid primary key default gen_random_uuid(),
  support_type_id uuid not null references public.support_types (id) on delete cascade,
  doc_key text not null,
  doc_name text not null,
  is_required boolean not null default true,
  -- 조건부 서류 설명 (예: '견적서 100만원 이상 시 2개 이상')
  condition text,
  -- 붙임 번호 (예: '붙임1')
  attachment_no text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (support_type_id, doc_key)
);
create index support_type_documents_type_idx
  on public.support_type_documents (support_type_id);
create trigger support_type_documents_set_updated_at
  before update on public.support_type_documents
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. document_templates — 붙임서식 HTML 템플릿 (hwp 원본 레이아웃 재현)
-- ----------------------------------------------------------------------------
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  -- 유형 전용 서식이면 support_type_id, 공통이면 null
  support_type_id uuid references public.support_types (id) on delete set null,
  attachment_no text,
  html_content text not null,
  -- 케이스 데이터 → 템플릿 필드 매핑 정의
  field_mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger document_templates_set_updated_at
  before update on public.document_templates
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. cases — 케이스 (접수신청서 붙임1 기준 필드)
-- ----------------------------------------------------------------------------
create table public.cases (
  id uuid primary key default gen_random_uuid(),
  support_type_id uuid not null references public.support_types (id) on delete restrict,
  status case_status not null default 'registered',
  -- 멘티 계정 (등록 후 초대되어 연결됨)
  mentee_id uuid references public.users (id) on delete set null,
  -- 등록한 진흥원 담당자
  created_by uuid not null references public.users (id) on delete restrict,

  -- 공통 (접수신청서)
  business_name text not null,
  owner_name text not null,
  business_reg_no text not null,
  phone text not null,
  address text not null,
  email text,
  business_type text,
  item text,
  opened_at date,
  employee_count integer,

  -- 폐업정리 전용
  closure_status closure_status,
  closed_at date,
  revenue_last_year numeric(14, 2),
  lease_deposit numeric(14, 2),
  monthly_rent numeric(14, 2),
  -- 전용면적(평) — 폐업정리 지원한도 계산(평당단가 × 면적 vs 한도)
  exclusive_area_pyeong numeric(10, 2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cases_status_idx on public.cases (status);
create index cases_support_type_idx on public.cases (support_type_id);
create index cases_mentee_idx on public.cases (mentee_id);
create trigger cases_set_updated_at before update on public.cases
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. case_status_history — 상태 변경 이력 (INSERT-only, 위변조 방지)
-- ----------------------------------------------------------------------------
create table public.case_status_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  from_status case_status,
  to_status case_status not null,
  changed_by uuid references public.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index case_status_history_case_idx on public.case_status_history (case_id);

-- ----------------------------------------------------------------------------
-- 7. mentor_assignments — 멘토-멘티 배정
-- ----------------------------------------------------------------------------
create table public.mentor_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  mentor_id uuid not null references public.users (id) on delete restrict,
  assigned_by uuid references public.users (id) on delete set null,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 케이스당 활성 배정 1건만 허용
create unique index mentor_assignments_active_case_idx
  on public.mentor_assignments (case_id) where is_active;
create index mentor_assignments_mentor_idx on public.mentor_assignments (mentor_id);
create trigger mentor_assignments_set_updated_at
  before update on public.mentor_assignments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. mentoring_logs — 멘토링 일지
-- ----------------------------------------------------------------------------
create table public.mentoring_logs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  mentor_id uuid not null references public.users (id) on delete restrict,
  visited_at timestamptz not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mentoring_logs_case_idx on public.mentoring_logs (case_id);
create trigger mentoring_logs_set_updated_at before update on public.mentoring_logs
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 9. signatures — 서명 이미지 (SHA-256 해시 저장)
-- ----------------------------------------------------------------------------
create table public.signatures (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  signer_type signer_type not null,
  signer_name text,
  -- 서명이 부착된 문서 유형 (예: mentoring_log, contract)
  document_type text not null,
  -- signatures 버킷 내 경로
  storage_path text not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index signatures_case_idx on public.signatures (case_id);

-- ----------------------------------------------------------------------------
-- 10. contractors — 공사·설비업체 정보
-- ----------------------------------------------------------------------------
create table public.contractors (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  company_name text not null,
  business_reg_no text,
  representative text,
  phone text,
  address text,
  work_type text,
  estimate_amount numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contractors_case_idx on public.contractors (case_id);
create trigger contractors_set_updated_at before update on public.contractors
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 11. documents — 업로드 서류 (SHA-256 해시)
-- ----------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  -- support_type_documents.doc_key 또는 자유 키
  doc_key text,
  doc_name text not null,
  -- documents 버킷 내 경로
  storage_path text not null,
  sha256 text not null,
  uploaded_by uuid references public.users (id) on delete set null,
  file_size bigint,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_case_idx on public.documents (case_id);
create index documents_case_key_idx on public.documents (case_id, doc_key);

-- ----------------------------------------------------------------------------
-- 12. support_applications — 지원신청서 (케이스당 1건)
-- ----------------------------------------------------------------------------
create table public.support_applications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases (id) on delete cascade,
  drafted_by uuid references public.users (id) on delete set null,
  content jsonb not null default '{}'::jsonb,
  -- 생성된 PDF (documents 버킷 경로)
  generated_pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger support_applications_set_updated_at
  before update on public.support_applications
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 13. reviews — 넥스트랩 검수 기록
-- ----------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  support_application_id uuid references public.support_applications (id) on delete set null,
  reviewer_id uuid references public.users (id) on delete set null,
  result review_result not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_case_idx on public.reviews (case_id);

-- ----------------------------------------------------------------------------
-- 14. approvals — 진흥원 승인/반려 (INSERT-only, 이력 보존)
-- ----------------------------------------------------------------------------
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  approval_type approval_type not null,
  approver_id uuid references public.users (id) on delete set null,
  result approval_result not null,
  -- 반려 시 사유 필수 (앱단 Zod + 서버 검증)
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index approvals_case_idx on public.approvals (case_id);

-- ----------------------------------------------------------------------------
-- 15. payment_applications — 지급신청서 (케이스당 1건)
-- ----------------------------------------------------------------------------
create table public.payment_applications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases (id) on delete cascade,
  drafted_by uuid references public.users (id) on delete set null,
  -- 지급계좌 (반드시 대표자 본인 명의 — 앱단 확인 문구)
  bank_name text,
  account_number text,
  account_holder text,
  amount numeric(14, 2),
  content jsonb not null default '{}'::jsonb,
  generated_pdf_path text,
  -- 완료보고서 제출기한 (선정통보 후 3개월)
  report_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payment_applications_set_updated_at
  before update on public.payment_applications
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 16. notifications — 알림 발송 이력 (알림톡 → SMS fallback)
-- ----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.cases (id) on delete set null,
  recipient_id uuid references public.users (id) on delete set null,
  recipient_phone text,
  channel notification_channel not null,
  template_code text,
  trigger_event text not null,
  status notification_status not null default 'pending',
  payload jsonb,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_case_idx on public.notifications (case_id);
create index notifications_status_idx on public.notifications (status);
create trigger notifications_set_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 17. audit_logs — 관리자 작업 로그 (INSERT-only, UPDATE/DELETE 차단)
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  ip_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
