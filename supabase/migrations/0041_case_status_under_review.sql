-- 개선 프로세스: '지원신청서 검수 중(under_review)' 단계 추가.
-- 흐름: 컨설팅 결과보고서 생성 → application_drafted(지원신청서 작성·접수)
--       → (송신) under_review(지원신청서 검수 중) → (넥스트랩 승인) reviewed(검수 완료)
-- enum 값 추가는 트랜잭션 밖에서 커밋되어야 이후 마이그레이션에서 사용 가능.
alter type case_status add value if not exists 'under_review' before 'reviewed';
