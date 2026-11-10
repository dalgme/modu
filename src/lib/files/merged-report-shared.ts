/**
 * 멘티별 회차 보고서 합본 PDF (2026-11-10) — 서버·브라우저·테스트 공용 순수 모듈.
 *
 * 멘티(케이스) 하나의 회차 보고서를 회차 순서대로 한 PDF 로 합쳐 documents 에 따로 저장한다(doc_key `mentoring_report_merged`, 케이스당 1건).
 * 한글(HWP·HWPX) 변환은 브라우저(rhwp)에서만 되므로, 합치기는 브라우저가 하고 서버는 목록·검증·저장만 한다.
 *
 * "합본이 최신인가"는 합칠 때 쓴 보고서 목록의 지문(fingerprint)으로 판단한다.
 * 지문은 저장 경로 이름에 넣는다: `{caseId}/merged-report-{지문}-r{합친 회차들}.pdf` — 보고서가 새로 올라오거나 바뀌거나 지워지면
 * 지금 목록의 지문과 달라져 '다시 만들기'가 필요하다고 표시한다(정산·상태에는 영향 없음).
 */

export const MERGED_REPORT_DOC_KEY = 'mentoring_report_merged';

/** 합본 PDF 하나의 최대 크기 */
export const MERGED_REPORT_MAX_BYTES = 150 * 1024 * 1024;

/** 합본에 들어갈 회차 보고서 1건 */
export interface MergedSource {
  roundNo: number;
  docId: string;
  storagePath: string;
  /** documents.updated_at (없으면 created_at) */
  stamp: string;
}

/** 32비트 FNV-1a (시드 다르게 두 번 → 16자리) — 보안용이 아니라 변경 감지용 */
function fnv1a(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 회차 순서로 정렬한 보고서 목록의 지문 */
export function mergedFingerprint(sources: MergedSource[]): string {
  const text = [...sources]
    .sort((a, b) => a.roundNo - b.roundNo || a.docId.localeCompare(b.docId))
    .map((s) => `${s.roundNo}|${s.docId}|${s.storagePath}|${s.stamp}`)
    .join('\n');
  return fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x01000193);
}

export function mergedStoragePath(caseId: string, fingerprint: string, includedRounds: number[]): string {
  const rounds = [...includedRounds].sort((a, b) => a - b).join('_') || '0';
  return `${caseId}/merged-report-${fingerprint}-r${rounds}.pdf`;
}

/** 저장 경로 → 지문·합친 회차. 형식이 다르면 null */
export function parseMergedStoragePath(path: string): { fingerprint: string; includedRounds: number[] } | null {
  const m = /merged-report-([0-9a-f]{16})-r([0-9_]+)\.pdf$/.exec(path);
  if (!m) return null;
  const includedRounds = m[2]!.split('_').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return { fingerprint: m[1]!, includedRounds };
}

export interface MergedReportStatus {
  /** 저장된 합본 (없으면 null) */
  doc: { id: string; name: string; createdAt: string } | null;
  /** 보고서가 등록된 회차들 (지금) */
  reportRounds: number[];
  /** 저장된 합본에 들어간 회차들 */
  includedRounds: number[];
  /** 보고서는 있지만 합본에 넣지 못한 회차 (Word 등) */
  missingRounds: number[];
  /** 합본 이후 보고서가 바뀌어 다시 만들어야 함 */
  stale: boolean;
}

/** 지금 보고서 목록 + 저장된 합본 문서 → 상태 */
export function mergedReportStatus(sources: MergedSource[], merged: { id: string; name: string; storagePath: string; createdAt: string } | null): MergedReportStatus {
  const reportRounds = Array.from(new Set(sources.map((s) => s.roundNo))).sort((a, b) => a - b);
  if (!merged) return { doc: null, reportRounds, includedRounds: [], missingRounds: [], stale: false };
  const parsed = parseMergedStoragePath(merged.storagePath);
  const includedRounds = parsed?.includedRounds ?? [];
  const stale = !parsed || parsed.fingerprint !== mergedFingerprint(sources);
  return {
    doc: { id: merged.id, name: merged.name, createdAt: merged.createdAt },
    reportRounds,
    includedRounds,
    missingRounds: stale ? [] : reportRounds.filter((r) => !includedRounds.includes(r)),
    stale,
  };
}

/** 회차 목록 표기 — [1,2,4] → "1·2·4회차" */
export function roundsText(rounds: number[]): string {
  return rounds.length ? `${rounds.join('·')}회차` : '-';
}

/* ── 서버 → 브라우저 합치기 목록 ─────────────────────────────────────── */

export interface MergedReportPlan {
  caseId: string;
  menteeName: string;
  /** 저장·다운로드 파일 이름 */
  name: string;
  fingerprint: string;
  /** 회차 순서 — label "N회차 보고서" */
  parts: { roundNo: number; label: string; sourceName: string; kind: 'pdf' | 'jpg' | 'png' | 'hwp' | 'other'; url: string }[];
}
