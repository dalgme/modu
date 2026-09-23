import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMentorSettlements } from '@/lib/data/settlements';
import { SettlementsTable } from '@/components/settlement/settlements-table';
import { formatKRW } from '@/lib/utils/format';
import { loadMentorDashboard } from '@/lib/data/role-dashboard';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/** 멘토 본인 정산 내역 (확정본만 — 예상액은 케이스 상세) */
export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const [items, dash] = await Promise.all([listMentorSettlements(profile.id, ctx.programId), loadMentorDashboard(profile.id, ctx.programId, null, '/mentor/cases')]);
  const total = items.reduce((a, s) => ({ gross: a.gross + Number(s.gross), net: a.net + Number(s.net) }), { gross: 0, net: 0 });
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">내 정산 내역</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name} · 확정 {items.length}건 · 지급총액 {formatKRW(total.gross)} · 실지급 {formatKRW(total.net)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-background p-4">
          <p className="text-xs text-muted-foreground">예상 정산액 (미확정)</p>
          <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{formatKRW(dash.estimatedGross)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">보고서까지 등록된 회차의 세전 합계. 운영사 검수 승인 시 같은 계산으로 확정됩니다.</p>
        </div>
        <div className="rounded-xl border bg-background p-4">
          <p className="text-xs text-muted-foreground">확정 실지급 합계</p>
          <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{formatKRW(total.net)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">원천징수(기타소득) 공제 후 금액 · {items.length}건</p>
        </div>
        <div className="rounded-xl border bg-background p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">정산 흐름</p>
          <p className="mt-1">회차 보고서 등록 → 관찰의견서 제출·종결 요청 → 운영사 검수 승인(확정) → 지급 품의 → 발주처 확인 → 지급. 확정된 건만 아래 표에 나옵니다.</p>
          {dash.reportPendingCount > 0 && <p className="mt-1 text-amber-700">보고서 미등록 회차 {dash.reportPendingCount}개는 예상액에 포함되지 않습니다. <Link href="/mentor/dashboard" className="underline">대시보드에서 등록</Link></p>}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border bg-background p-6 text-center text-sm text-muted-foreground">아직 확정된 정산이 없습니다. 케이스가 종결 검수를 통과하면 여기에 정산서와 금액이 나타납니다.</p>
      ) : (
        <SettlementsTable items={items} caseHrefBase="/mentor/cases" />
      )}
    </main>
  );
}
