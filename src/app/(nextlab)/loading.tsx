import { PageSkeleton } from '@/components/common/page-skeleton';

/** 운영사 콘솔 라우트 로딩 — 서버 데이터가 오기 전 레이아웃 뼈대를 먼저 그린다. */
export default function Loading() {
  return <PageSkeleton />;
}
