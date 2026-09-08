/** 종합결과리포트 스냅샷 목록 항목 (클라이언트·서버 공용 타입) */
export interface SnapshotListItem {
  id: string;
  title: string;
  generatedAt: string;
  generatedByName: string | null;
  groupName: string | null;
  cases: number;
  closed: number;
}
