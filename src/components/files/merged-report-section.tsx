import type { MergedReportStatus } from '@/lib/files/merged-report-shared';
import { MergedReportButton, type MergedStatusProps } from '@/components/files/merged-report-button';

/** 서버 상태 → 클라이언트 버튼 props (문자열·숫자·배열만 — CLAUDE.md §6-10) */
export function mergedProps(m: MergedReportStatus): MergedStatusProps {
  return { docId: m.doc?.id ?? null, name: m.doc?.name ?? null, stale: m.stale, includedRounds: m.includedRounds, missingRounds: m.missingRounds, reportRounds: m.reportRounds };
}

/**
 * 케이스 화면 회차 카드 아래 "회차 보고서 합본 PDF" 줄 (2026-11-10) — 멘토·운영사·발주처 공용 서버 컴포넌트.
 * 회차 보고서를 회차 순서대로 PDF 한 개로 합쳐 따로 저장하고 받는다.
 */
export function MergedReportSection({ caseId, status, canBuild = true }: { caseId: string; status: MergedStatusProps; canBuild?: boolean }) {
  if (status.reportRounds.length === 0 && !status.docId) return null;
  return (
    <div className="mt-4 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="min-w-0">
        <p className="text-sm font-semibold">회차 보고서 합본 PDF</p>
        <p className="text-xs text-muted-foreground">등록된 회차 보고서를 1회차부터 순서대로 PDF 한 개로 합쳐 저장합니다. 보고서가 바뀌면 다시 만들어 주세요.</p>
      </div>
      <MergedReportButton caseId={caseId} status={status} canBuild={canBuild} />
    </div>
  );
}
