import Link from 'next/link';

import type { CaseListItem } from '@/lib/data/cases';
import type { Branding } from '@/lib/programs/branding';
import { MenteeJourney } from '@/components/cases/mentee-journey';
import { StatusBadge } from '@/components/cases/status-badge';
import { formatDate } from '@/lib/utils/format';

/** 멘티 대시보드 본문 — 현재 그룹 케이스의 여정 + 다른 그룹(승계) 케이스 목록 */
export function MenteeDashboardBody({
  name,
  cases,
  branding,
}: {
  name: string;
  cases: CaseListItem[];
  branding: Branding;
}) {
  const [primary, ...others] = cases;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">{name}님, 안녕하세요</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {primary ? `${primary.supportTypeName ?? ''} 컨설팅 진행 현황입니다.` : '아직 등록된 케이스가 없습니다.'}
        </p>
      </div>

      {primary && (
        <>
          <MenteeJourney
            status={primary.status}
            roundsDone={primary.roundsDone}
            requiredRounds={primary.requiredRounds}
            branding={branding}
          />
          <div className="rounded-xl border bg-background p-4 text-sm shadow-sm">
            <p>
              담당 멘토: <b>{primary.mentorName ?? '배정 예정'}</b>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              회차 서명·만족도 조사·멘토 변경 요청은 다음 단계(P5)에서 열립니다.
            </p>
          </div>
        </>
      )}

      {others.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">다른 그룹 참여 이력</h2>
          <ul className="flex flex-col gap-2">
            {others.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                <span>
                  {c.supportTypeName ?? '-'} · 멘토 {c.mentorName ?? '-'} · {formatDate(c.created_at)}
                </span>
                <StatusBadge status={c.status} branding={branding} short />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        문의가 있으면 <Link href="/mentee/inquiries" className="underline">문의하기</Link>를 이용하세요.
      </p>
    </div>
  );
}
