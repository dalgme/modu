-- 0032: 안내 페이지 FAQ 저장 테이블. (주)넥스트랩 관리자가 수정/추가/삭제한다.
--  audience 로 대상 구분(현재 'mentor'). 게시(is_published)된 항목만 대상 역할이 열람.

create table if not exists public.faqs (
  id uuid primary key default gen_random_uuid(),
  audience text not null default 'mentor',
  question text not null,
  answer text not null,
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_faqs_audience on public.faqs (audience, sort_order);

alter table public.faqs enable row level security;

-- 게시된 FAQ 는 로그인 사용자 누구나 열람, 미게시/전체는 운영진(staff)만.
drop policy if exists faqs_select on public.faqs;
create policy faqs_select on public.faqs for select
  using (is_published or private.is_staff());

-- 추가/수정/삭제는 운영진(진흥원·넥스트랩)만.
drop policy if exists faqs_write on public.faqs;
create policy faqs_write on public.faqs for all
  using (private.is_staff())
  with check (private.is_staff());

-- 초기 예시 FAQ (멘토)
insert into public.faqs (audience, question, answer, sort_order) values
  ('mentor', '멘토로 배정되면 무엇부터 하나요?', '넥스트랩이 멘토님을 케이스에 배정하면 멘토 대시보드 상단에 신규 배정 케이스가 표시됩니다. 케이스를 열어 멘티 정보를 확인하고, 미팅 일정을 잡은 뒤 멘토링 일지를 작성하는 것으로 시작합니다.', 10),
  ('mentor', '멘토가 작성·제출하는 서류는 어디까지인가요?', '멘토의 업무 범위는 지원신청서 작성·제출, 부속서류(동의·확약 등), 멘토링 결과보고서 제출까지입니다. 이후 검수·지급 등 절차는 (주)넥스트랩과 진흥원이 이어받아 진행합니다.', 20),
  ('mentor', '멘티가 로그인을 못 하면 어떻게 하나요?', '멘토 케이스 상세의 ‘멘티 미팅 지원’ 패널에서 담당 멘티의 임시 비밀번호를 재설정할 수 있습니다. 임시 비밀번호는 멘티의 휴대폰 번호이며, 멘티는 휴대폰 번호로도 로그인할 수 있습니다.', 30),
  ('mentor', '미팅 확인 서명은 왜 받나요?', '미팅 현장에서 멘티의 확인 서명을 받아두면, 멘토링보고서·지원신청서 등 서식의 신청업체(대표자) 서명 자리에 자동으로 사용됩니다. 서류마다 다시 서명을 받을 필요가 없습니다.', 40);
