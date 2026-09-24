/** 종합결과리포트 스냅샷 목록 항목 (클라이언트·서버 공용 타입) */
export interface SnapshotListItem {
  id: string;
  title: string;
  generatedAt: string;
  generatedByName: string | null;
  groupName: string | null;
  cases: number;
  closed: number;
  /** (P31) 리포트 구분 — 내부용 / 발주처 공유용 */
  audience: 'internal' | 'client';
  /** (P31) 숨김(소프트 삭제) */
  hidden: boolean;
  /** (P31) 집계 기간 라벨 (기간 스냅샷일 때) */
  period: string | null;
}
