import type { RoundItem } from '@/lib/data/rounds';
import { formatDate } from '@/lib/utils/format';
import { roundTimeRangeLabel } from '@/lib/workflow/round-time';
import { FilePreviewButton } from '@/components/files/file-preview';

/**
 * 멘티 컨설팅 회차 확인 — 회차 일정과 멘토가 올린 보고서를 열람만 한다.
 * (2026-11-12) 멘티 확인 서명 기능 폐지 — 서명 버튼·서명 상태 표시 없음.
 */
export function MenteeRoundList({ rounds }: { rounds: RoundItem[] }) {
  if (rounds.length === 0) return <p className="text-sm text-muted-foreground">아직 등록된 컨설팅 회차가 없습니다.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {rounds.map((r) => (
        <li key={r.id} className="rounded-xl border bg-background p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">{r.round_no}회차{r.is_extra ? ' (추가)' : ''}</span>
              <span>{r.mode === 'online' ? '온라인' : '오프라인'}</span>
              <span className="text-muted-foreground">{formatDate(r.started_at)} {roundTimeRangeLabel(r.started_at, r.ended_at)}</span>
              {r.place && <span className="text-muted-foreground">· {r.place}</span>}
              <span className="text-muted-foreground">· 멘토 {r.mentorName ?? '-'}</span>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs ${r.report_registered_at ? 'bg-emerald-100 font-semibold text-emerald-800' : 'bg-muted text-muted-foreground'}`}>
              {r.report_registered_at ? '보고서 등록' : new Date(r.started_at).getTime() > Date.now() ? '진행 예정' : '보고서 등록 대기'}
            </span>
          </div>
          {r.topic && <p className="mt-2 text-sm font-semibold">{r.topic}</p>}
          {r.content && <p className="mt-1 whitespace-pre-wrap text-sm">{r.content}</p>}
          {r.result && <p className="mt-1 text-sm text-muted-foreground">결과·다음 과제: {r.result}</p>}
          {r.report && (
            <p className="mt-1 text-sm">
              보고서:{' '}
              {r.report.url ? (
                <a href={r.report.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                  {r.report.name}
                </a>
              ) : (
                r.report.name
              )}{' '}
              <FilePreviewButton docId={r.report.id} name={r.report.name} size="xs" />
            </p>
          )}
          {r.photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {/* signed URL(5분) 이미지 — next/image 최적화 대상이 아님 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.photos.map((p) => p.url && <img key={p.id} src={p.url} alt={p.name} className="h-20 w-20 rounded-md object-cover" />)}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
