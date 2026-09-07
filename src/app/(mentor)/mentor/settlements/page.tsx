import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMentorSettlements } from '@/lib/data/settlements';
import { SettlementsTable } from '@/components/settlement/settlements-table';
import { formatKRW } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** 멘토 본인 정산 내역 (확정본만 — 예상액은 케이스 상세) */
export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const items = await listMentorSettlements(profile.id, ctx.programId);
  const total = items.reduce((a, s) => ({ gross: a.gross + Number(s.gross), net: a.net + Number(s.net) }), { gross: 0, net: 0 });
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">내 정산 내역</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name} · 확정 {items.length}건 · 지급총액 {formatKRW(total.gross)} · 실지급 {formatKRW(total.net)}
        </p>
      </div>
      <SettlementsTable items={items} caseHrefBase="/mentor/cases" />
    </main>
  );
}
