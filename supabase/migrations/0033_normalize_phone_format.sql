-- 회원 휴대폰 저장 형식 표준화: 010-XXXX-XXXX (표시·검색 일관화)
-- 로그인은 숫자 정규화로 매칭하고 임시 비밀번호는 auth 에 이미 저장되어 있어,
-- 이 형식 변경은 로그인·인증에 영향을 주지 않는다(표시값만 정리).
-- 대상: 숫자만 11자리(010XXXXXXXX) 또는 비표준 하이픈이 섞인 11자리 → 표준 하이픈으로 변환.
update public.users
set phone = regexp_replace(regexp_replace(phone, '\D', '', 'g'),
                           '^(\d{3})(\d{4})(\d{4})$', '\1-\2-\3'),
    updated_at = now()
where phone is not null
  and regexp_replace(phone, '\D', '', 'g') ~ '^01\d{9}$'
  and phone !~ '^\d{3}-\d{4}-\d{4}$';

-- 10자리(010-XXX-XXXX, 구형) 도 표준 하이픈으로 정리
update public.users
set phone = regexp_replace(regexp_replace(phone, '\D', '', 'g'),
                           '^(\d{3})(\d{3})(\d{4})$', '\1-\2-\3'),
    updated_at = now()
where phone is not null
  and regexp_replace(phone, '\D', '', 'g') ~ '^01\d{8}$'
  and phone !~ '^\d{3}-\d{3}-\d{4}$';
