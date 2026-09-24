'use client';

import { useState } from 'react';
import Link from 'next/link';

import { getMentorPopupAction, type MentorPopupData } from '@/lib/mentors/popup-actions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RoundDots } from '@/components/common/round-dots';
import { ContactLinks } from '@/components/common/contact-links';
import { mentorLabel } from '@/lib/utils/labels';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * 멘토 이름 표기 + 레이어 팝업 (P25-03·10 · P27-07).
 * "이름(현재 확정 배정 멘티 수)" 로 보이고, 클릭하면 개인 정보·분야(10)·직위·소속멘토기관·권역·비고·그룹 지정·
 * 그룹별 매칭 멘티·멘티별 만족도·운영사 평가를 팝업으로 띄운다.
 * 로딩은 useTransition 이 아니라 명시적 상태로 관리한다(React 18 에서 async transition 은 pending 을 유지하지 않아 빈 팝업이 됐던 원인).
 */
export function MentorName({
  id,
  name,
  count,
  className,
  caseHrefBase = '/nextlab/cases',
}: {
  id: string | null | undefined;
  name: string;
  count?: number | null;
  className?: string;
  caseHrefBase?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MentorPopupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const text = count === undefined || count === null ? name : mentorLabel(name, count);
  if (!id) return <span className={className}>{text}</span>;

  // 열 때마다 다시 불러온다 — 배정·평가가 바뀐 뒤 옛 데이터가 보이지 않게 (P28)
  const load = async () => {
    setOpen(true);
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await getMentorPopupAction(id);
      if (r.ok) setData(r.data);
      else setError(r.error);
    } catch (err) {
      setError(`불러오기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => void load()} className={cn('font-medium text-primary underline-offset-2 hover:underline', className)} title="멘토 정보 보기">
        {text}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{data ? mentorLabel(data.name, data.activeCount) : name} · 멘토 정보</DialogTitle>
            <DialogDescription>
              개인 정보 · 분야 · 그룹별 매칭 멘티 · 멘티별 만족도 · 운영사 평가 (담당 멘티는 현재 범위 기준)
              {caseHrefBase.startsWith('/nextlab') && (
                <>
                  {' · '}
                  <Link href={`/nextlab/roster?tab=mentor&edit=${id}`} className="font-medium text-primary underline underline-offset-2">명단에서 정보 수정</Link>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {loading && !data && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
              <button type="button" className="ml-2 underline" onClick={() => { setError(null); void load(); }}>다시 시도</button>
            </div>
          )}
          {data && (
            <div className="flex flex-col gap-4 text-sm">
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">이름 / 소속</dt>
                <dd><b>{data.name}</b>{data.organization ? ` / ${data.organization}` : ''}</dd>
                <dt className="text-muted-foreground">휴대폰 / 이메일</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  <span>{data.phone ?? '-'}{data.email ? ` / ${data.email}` : ''}</span>
                  <ContactLinks phone={data.phone} name={data.name} size="xs" />
                </dd>
                <dt className="text-muted-foreground">분야 (최대 10)</dt>
                <dd className="flex flex-wrap gap-1">
                  {data.expertise.length === 0 && '-'}
                  {data.expertise.map((e) => (
                    <span key={e} className="rounded bg-muted px-1.5 py-0.5 text-xs">{e}</span>
                  ))}
                </dd>
                <dt className="text-muted-foreground">직위</dt>
                <dd>{data.position ?? '-'}</dd>
                <dt className="text-muted-foreground">소속멘토기관</dt>
                <dd>{data.mentorInstitution ?? '-'}</dd>
                <dt className="text-muted-foreground">권역</dt>
                <dd>{data.regions.join(', ') || '-'}</dd>
                {data.note !== null && (
                  <>
                    <dt className="text-muted-foreground">비고</dt>
                    <dd className="whitespace-pre-wrap">{data.note || '-'}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">그룹 지정</dt>
                <dd>{data.designatedGroups.length ? data.designatedGroups.join(', ') : '지정 없음 (모든 그룹에서 사용)'}</dd>
                <dt className="text-muted-foreground">그룹별 매칭 멘티</dt>
                <dd className="flex flex-wrap gap-1">
                  {data.byGroup.length === 0 && <span className="text-muted-foreground">배정 없음 (배정 대기)</span>}
                  {data.byGroup.map((g) => (
                    <span key={g.groupName} className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">{g.groupName} ({g.count})</span>
                  ))}
                </dd>
                <dt className="text-muted-foreground">만족도 평균</dt>
                <dd>{data.surveyAvg ?? '-'}</dd>
                {data.reviews.length > 0 || data.reviewAvg !== null ? (
                  <>
                    <dt className="text-muted-foreground">운영사 평가</dt>
                    <dd>{data.reviewAvg !== null ? `${data.reviewAvg}점 평균 · ${data.reviews.length}건` : '-'}</dd>
                  </>
                ) : null}
              </dl>
              <div>
                <p className="mb-1 font-semibold">담당 멘티 {data.mentees.length}명 (현재 범위)</p>
                {data.mentees.length === 0 ? (
                  <p className="text-muted-foreground">현재 배정된 멘티가 없습니다 (배정 대기).</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                          <th className="px-2 py-1.5">멘티</th>
                          <th className="px-2 py-1.5">라운드</th>
                          <th className="px-2 py-1.5">매칭일</th>
                          <th className="px-2 py-1.5">확인</th>
                          <th className="px-2 py-1.5">진행</th>
                          <th className="px-2 py-1.5 text-right">멘토 평가(만족도)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.mentees.map((c) => (
                          <tr key={c.caseId} className={cn('border-b last:border-0', c.withdrawn && 'opacity-60')}>
                            <td className="px-2 py-1.5">
                              <Link href={`${caseHrefBase}/${c.caseId}`} className="text-primary hover:underline">{c.label}</Link>
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{c.groupName ?? '-'}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{formatDate(c.assignedAt)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{c.confirmedAt ? `O ${formatDate(c.confirmedAt)}` : '-'}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <span className="mr-1">{c.statusLabel}</span>
                              <RoundDots done={c.roundsDone} required={c.requiredRounds} />
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{c.surveyScore ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {data.reviews.length > 0 && (
                <div>
                  <p className="mb-1 font-semibold">운영사 평가 기록 {data.reviews.length}건</p>
                  <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
                    {data.reviews.map((r) => (
                      <li key={r.id} className="rounded border bg-background px-2 py-1">
                        [{r.groupName}] {r.rating ? `${r.rating}점 · ` : ''}{r.memo ?? ''} <span className="text-muted-foreground">— {r.authorName} {formatDate(r.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
