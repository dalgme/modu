import { requireMentee } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { pickMenteeCase } from '@/lib/data/mentee';
import { listRounds } from '@/lib/data/rounds';
import { MenteeRoundList } from '@/components/mentee/mentee-round-list';
import { MenteeCaseSwitcher } from '@/components/mentee/mentee-case-switcher';

export const dynamic = 'force-dynamic';

/** 멘티 컨설팅 회차 확인(열람 전용) — 승계로 케이스가 여러 건이면 `?case=` 로 고른다 (P30). 멘티 확인 서명은 2026-11-12 폐지 */
export default async function Page({ searchParams }: { searchParams: { case?: string } }) {
  const profile = await requireMentee();
  const ctx = await requireContext(profile);
  const pick = await pickMenteeCase(profile.id, { programId: ctx.programId, supportTypeId: ctx.supportTypeId }, searchParams.case);
  const c = pick.current;
  const rounds = c ? await listRounds(c.id) : [];
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">컨설팅 회차 확인</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {c ? `${c.supportTypeName ?? ''} · 보고서 등록 ${rounds.filter((r) => r.report_registered_at).length}/${c.requiredRounds}회차` : '아직 등록된 컨설팅이 없습니다. 운영사에 문의해 주세요.'}
        </p>
      </div>
      {pick.cases.length > 1 && c && <MenteeCaseSwitcher href="/mentee/rounds" cases={pick.cases} currentId={c.id} pending={pick.pending} hint="rounds" />}
      {c && <MenteeRoundList rounds={rounds} />}
    </main>
  );
}
