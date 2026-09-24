import { PageSkeleton } from '@/components/common/page-skeleton';

/** 관리 화면(문자 발송·설정) 라우트 로딩 스켈레톤 */
export default function Loading() {
  return <PageSkeleton cards={4} rows={5} />;
}
