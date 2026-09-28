/**
 * 승계 개설 공용 상수·타입 (P35 핫픽스) — 서버(설정 페이지)와 클라이언트(`SuccessionPanel`)가 같이 읽는다.
 * ⚠ 'use client' 파일에서 export 한 배열을 서버 컴포넌트가 import 하면 클라이언트 참조 프록시가 되어
 *    `.find()` 호출 시 500 이 난다("Attempted to call find() from the server but find is on the client",
 *    2026-09-23~28 `/nextlab/settings` 런타임 오류 7건). 그래서 상수는 이 파일(서버·클라이언트 중립)에 둔다. CLAUDE.md §6-10.
 */
import type { CaseStatus } from '@/types/case-status';

export type SuccessionMode = 'succession' | 'relocation';
export type SuccessionFilter = 'completed' | 'all' | 'withdrawn';

/** 승계 원천 필터 칩 — 서버(설정 페이지)와 화면이 같은 상수를 읽는다 */
export const SUCCESSION_FILTERS: { key: SuccessionFilter; label: string; statuses: CaseStatus[] | null }[] = [
  { key: 'completed', label: '수료', statuses: ['settlement_pending', 'settlement_batched', 'closed'] },
  { key: 'all', label: '전체', statuses: null },
  { key: 'withdrawn', label: '중도 종료', statuses: ['withdrawn'] },
];

export interface SuccessorInfo {
  caseId: string;
  supportTypeName: string | null;
  status: CaseStatus;
}
