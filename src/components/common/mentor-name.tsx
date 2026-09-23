'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { getMentorPopupAction, type MentorPopupData } from '@/lib/mentors/popup-actions';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RoundDots } from '@/components/common/round-dots';
import { mentorLabel } from '@/lib/utils/labels';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

/**
 * 멘토 이름 표기 + 레이어 팝업 (P25-03·10).
 * "이름(현재 확정 배정 멘티 수)" 로 보이고, 클릭하면 개인 정보·분야·담당 멘티를 팝업으로 띄운다.
 * count 를 모르는 화면은 이름만 보이며 팝업 안에서 정확한 수를 보여준다.
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
  const [pending, start] = useTransition();
  const text = count === undefined || count === null ? name : mentorLabel(name, count);
  if (!id) return <span className={className}>{text}</span>;

  const load = () => {
    setOpen(true);
    if (data) return;
    start(async () => {
      const r = await getMentorPopupAction(id);
      if (r.ok) setData(r.data);
      else setError(r.error);
    });
  };

  return (
    <>
      <button type="button" onClick={load} className={cn('font-medium text-primary underline-offset-2 hover:underline', className)} title="멘토 정보 보기">
        {text}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{data ? mentorLabel(data.name, data.activeCount) : name} · 멘토 정보</DialogTitle>
            <DialogDescription>개인 정보 · 분야 · 현재 담당 멘티 (현재 범위 기준)</DialogDescription>
          </DialogHeader>
          {pending && !data && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {data && (
            <div className="flex flex-col gap-4 text-sm">
              <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">소속 · 직위</dt>
                <dd>{[data.organization, data.position].filter(Boolean).join(' · ') || '-'}</dd>
                <dt className="text-muted-foreground">소속멘토기관</dt>
                <dd>{data.mentorInstitution ?? '-'}</dd>
                <dt className="text-muted-foreground">연락처</dt>
                <dd>{data.phone ?? '-'}{data.email ? ` · ${data.email}` : ''}</dd>
                <dt className="text-muted-foreground">분야</dt>
                <dd className="flex flex-wrap gap-1">
                  {data.expertise.length === 0 && '-'}
                  {data.expertise.map((e) => (
                    <span key={e} className="rounded bg-muted px-1.5 py-0.5 text-xs">{e}</span>
                  ))}
                </dd>
                <dt className="text-muted-foreground">권역</dt>
                <dd>{data.regions.join(', ') || '-'}</dd>
                <dt className="text-muted-foreground">그룹 지정</dt>
                <dd>{data.designatedGroups.length ? data.designatedGroups.join(', ') : '지정 없음 (모든 그룹에서 사용)'}</dd>
                {data.note !== null && (
                  <>
                    <dt className="text-muted-foreground">비고</dt>
                    <dd className="whitespace-pre-wrap">{data.note || '-'}</dd>
                  </>
                )}
              </dl>
              <div>
                <p className="mb-1 font-semibold">담당 멘티 {data.mentees.length}명</p>
                {data.mentees.length === 0 ? (
                  <p className="text-muted-foreground">현재 배정된 멘티가 없습니다 (Pool).</p>
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
                        </tr>
                      </thead>
                      <tbody>
                        {data.mentees.map((c) => (
                          <tr key={c.caseId} className="border-b last:border-0">
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
