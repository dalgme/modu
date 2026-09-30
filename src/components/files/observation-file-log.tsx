import type { ObservationHistoryItem } from '@/lib/data/rounds';
import { formatDateTime } from '@/lib/utils/format';

/** 1분 넘게 차이 나야 "수정"으로 본다(최초 저장 직후 updated_at 갱신과 구분) */
function wasModified(createdAt: string, updatedAt: string): boolean {
  return new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 60_000;
}

const KIND_LABEL: Record<ObservationHistoryItem['kind'], string> = { upload: '최초 업로드', replace: '수정 업로드', delete: '삭제' };

/**
 * 관찰의견서 파일 로그 (2026-09-30) — 바이올렛 줄(저장 파일명 · 최초 업로드 · 최근 수정) + [변경 이력] 접기.
 * 훅·이벤트 없는 순수 컴포넌트라 서버(운영사·발주처 케이스 화면)와 클라이언트(멘토 폼) 양쪽에서 쓴다.
 * 이력은 감사 로그(observation.upload/replace/delete) — 이 기능 이전에 올린 파일은 이력 없이 등록일만 보인다.
 */
export function ObservationFileLog({
  fileName,
  createdAt,
  updatedAt,
  history,
}: {
  fileName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  history: ObservationHistoryItem[];
}) {
  const replaceCount = history.filter((h) => h.kind === 'replace').length;
  return (
    <div className="flex flex-col gap-1.5">
      {fileName && createdAt && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md bg-violet-100 px-3 py-1.5 text-xs text-violet-950 dark:bg-violet-950/50 dark:text-violet-100">
          <span className="min-w-0 break-all">
            저장 파일명 <b>{fileName}</b>
          </span>
          <span className="whitespace-nowrap">최초 업로드 <b className="tabular-nums">{formatDateTime(createdAt)}</b></span>
          {updatedAt && wasModified(createdAt, updatedAt) && (
            <span className="whitespace-nowrap">
              최근 수정 <b className="tabular-nums">{formatDateTime(updatedAt)}</b>
              {replaceCount > 0 ? ` (수정 ${replaceCount}회)` : ''}
            </span>
          )}
        </p>
      )}
      {history.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">파일 변경 이력 {history.length}건</summary>
          <ol className="mt-1 flex flex-col gap-0.5 border-l-2 border-violet-200 pl-3 dark:border-violet-800">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-muted-foreground">{formatDateTime(h.at)}</span>
                <span className={`font-semibold ${h.kind === 'delete' ? 'text-red-600 dark:text-red-400' : ''}`}>{KIND_LABEL[h.kind]}</span>
                {h.fileName && <span className="min-w-0 break-all">{h.fileName}</span>}
                {h.actorName && (
                  <span className="text-muted-foreground">
                    · {h.actorName}
                    {h.viaViewAs ? ' (멘토 화면 대행)' : ''}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
