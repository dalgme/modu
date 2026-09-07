import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getMenteeCase } from '@/lib/data/cases';
import { listRounds } from '@/lib/data/rounds';
import { RoundSignList } from '@/components/mentee/round-sign-list';
import { resolveRoundReportPolicy } from '@/lib/documents/round-report';

export const dynamic = 'force-dynamic';

/** 멘티 회차 확인·서명 */
export default async function Page() {
  const profile = await requireMentee();
  const ctx = await requireContext(profile);
  const c = await getMenteeCase(profile.id, { programId: ctx.programId, supportTypeId: ctx.supportTypeId ?? undefined });
  const rounds = c ? await listRounds(c.id) : [];
  const policy = c ? await resolveRoundReportPolicy(c.program_id, c.support_type_id) : null;
  const signEnabled = !!policy?.menteeConfirmSignature;
  const unsigned = signEnabled ? rounds.filter((r) => !r.mentee_signed_at).length : 0;
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">컨설팅 회차 확인 · 서명</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {c ? `${c.supportTypeName ?? ''} · 회차 ${rounds.length}/${c.requiredRounds}` : '등록된 케이스가 없습니다.'}
          {unsigned > 0 && <span className="ml-2 font-semibold text-amber-700">서명 대기 {unsigned}회차</span>}
        </p>
      </div>
      {c && !signEnabled && <p className="text-xs text-muted-foreground">이 그룹은 확인 서명을 받지 않습니다. 회차 내용만 열람합니다.</p>}
      {c && <RoundSignList caseId={c.id} rounds={rounds} signEnabled={signEnabled} />}
    </main>
  );
}
