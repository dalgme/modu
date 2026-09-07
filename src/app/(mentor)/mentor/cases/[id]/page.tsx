import { notFound } from 'next/navigation';

import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getCaseById, getCaseStatusHistory, listPredecessorCases } from '@/lib/data/cases';
import { CaseDetailShell } from '@/components/cases/case-detail-shell';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';

export const maxDuration = 60;

export default async function Page({ params }: { params: { id: string } }) {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const item = await getCaseById(params.id);
  // 담당 멘토(활성 배정)가 아니면 RLS 로 조회되지 않는다 — 대행 중에는 코드로 재확인
  if (!item || item.program_id !== ctx.programId || item.mentorId !== profile.id) notFound();

  const [history, predecessors] = await Promise.all([getCaseStatusHistory(item.id), listPredecessorCases(item.id)]);

  return (
    <main className="flex flex-col gap-5">
      <CaseDetailBackNav dashboardHref="/mentor/dashboard" />
      <CaseDetailShell item={item} history={history} predecessors={predecessors} branding={ctx.branding} basePath="/mentor/cases">
        <div className="rounded-xl border border-dashed bg-background px-4 py-6 text-center text-sm text-muted-foreground">
          회차 등록 · 관찰의견서 · 종결 요청 · 추가 회차 요청 · 중도 종료 요청은 다음 단계(P3)에서 열립니다.
        </div>
      </CaseDetailShell>
    </main>
  );
}
