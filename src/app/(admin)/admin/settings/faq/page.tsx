import { redirect } from 'next/navigation';

/** 구 경로 — 멘토 FAQ 관리는 게시판 탭으로 통합됨 (P20). */
export default function Page() {
  redirect('/nextlab/board?tab=faq');
}
