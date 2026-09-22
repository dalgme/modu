'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, UserCheck } from 'lucide-react';

import type { MenteeMatchRow, MentorMatchRow } from '@/lib/data/matching-lists';
import { confirmMatchAction } from '@/lib/matching/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils/format';

/** P24 매칭 리스트 — 멘토 기준 / 멘티 기준. 확인 여부 = 멘토가 로그인해 배정을 열람한 시각. */

function ConfirmMark({ at }: { at: string | null }) {
  return at ? (
    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-4 w-4" /> 확인 {formatDate(at)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Circle className="h-3.5 w-3.5" /> 미확인
    </span>
  );
}

export function MentorMatchList({ rows, caseHrefBase = '/nextlab/cases' }: { rows: MentorMatchRow[]; caseHrefBase?: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">등록된 멘토가 없습니다.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        확인 여부 = 멘토가 플랫폼에 로그인해 배정된 멘티를 열람한 시각입니다. 미배정 멘토는 자동 추천 후보(Pool)로 사용됩니다.
      </p>
      {rows.map((m) => (
        <div key={m.mentorId} className="rounded-xl border bg-background p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{m.mentorName}</span>
            {m.organization && <span className="text-xs text-muted-foreground">{m.organization}</span>}
            {m.expertise.length > 0 && <span className="text-xs text-muted-foreground">분야: {m.expertise.join(', ')}</span>}
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.mentees.length > 0 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
              {m.mentees.length > 0 ? `담당 멘티 ${m.mentees.length}` : '미배정 (Pool)'}
            </span>
          </div>
          {m.mentees.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-1">멘티</th>
                    <th className="px-2 py-1">그룹</th>
                    <th className="px-2 py-1">매칭 일자</th>
                    <th className="px-2 py-1">확인 여부</th>
                    <th className="px-2 py-1">컨설팅 진행현황</th>
                  </tr>
                </thead>
                <tbody>
                  {m.mentees.map((c) => (
                    <tr key={c.caseId} className="border-b last:border-0">
                      <td className="px-2 py-1.5">
                        <Link href={`${caseHrefBase}/${c.caseId}`} className="font-medium text-primary hover:underline">
                          {c.menteeName}/{c.businessName}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.groupName ?? '-'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.assignedAt ? formatDate(c.assignedAt) : '-'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap"><ConfirmMark at={c.confirmedAt} /></td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {c.statusLabel} · 회차 {c.roundsDone}/{c.requiredRounds}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function MenteeMatchList({ rows, caseHrefBase = '/nextlab/cases' }: { rows: MenteeMatchRow[]; caseHrefBase?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  const confirm = (caseId: string, mentorId: string, mentorName: string, menteeName: string) => {
    if (!window.confirm(`${menteeName} 멘티를 '${mentorName}' 멘토에게 매칭 확정할까요?`)) return;
    start(async () => {
      const r = await confirmMatchAction(caseId, mentorId);
      toast(r.ok ? { title: `${mentorName} 멘토로 매칭을 확정했습니다.` } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">등록된 멘티가 없습니다.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        재배치 희망 멘토가 미배정 상태면 등록 시 자동 확정됩니다. 희망 멘토가 이미 매칭된 경우 희망분야 1~6순위 순서로
        <b> 미배정 멘토 최대 3명</b>이 자동 추천되며, 아래 [매칭 확정]을 누르면 배정됩니다. 확정된 멘토는 다른 멘티의 추천에서 자동 제외·재계산됩니다.
      </p>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2">멘티</th>
              <th className="px-3 py-2">그룹</th>
              <th className="px-3 py-2">배정 멘토</th>
              <th className="px-3 py-2">매칭 일자</th>
              <th className="px-3 py-2">확인 여부(멘토)</th>
              <th className="px-3 py-2">만족도</th>
              <th className="px-3 py-2">진행</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.caseId} className={`border-b align-top last:border-0 ${r.withdrawn ? 'opacity-60' : ''}`}>
                <td className="px-3 py-2">
                  <Link href={`${caseHrefBase}/${r.caseId}`} className="font-medium text-primary hover:underline">
                    {r.menteeName}/{r.businessName}
                  </Link>
                  {r.preferredMentor && <p className="mt-0.5 text-[11px] text-muted-foreground">재배치 희망: {r.preferredMentor}</p>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.groupName ?? '-'}</td>
                <td className="px-3 py-2">
                  {r.mentorName ? (
                    <span className="inline-flex items-center gap-1 font-semibold"><UserCheck className="h-3.5 w-3.5 text-emerald-600" /> {r.mentorName}</span>
                  ) : r.recommendations.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {r.recommendations.map((rec) => (
                        <div key={rec.mentorId} className="flex items-center gap-1.5">
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">추천 {rec.rank}</span>
                          <span title={rec.rationale ?? undefined}>{rec.mentorName}</span>
                          {r.canConfirm && (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={pending} onClick={() => confirm(r.caseId, rec.mentorId, rec.mentorName, r.menteeName)}>
                              매칭 확정
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">미배정 · 추천 없음</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.assignedAt ? formatDate(r.assignedAt) : '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.mentorName ? <ConfirmMark at={r.confirmedAt} /> : '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.surveyDone ? '작성 완료' : '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.statusLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
