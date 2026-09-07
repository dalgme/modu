import Link from 'next/link';

import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { listBatches, BATCH_STATUS_LABELS } from '@/lib/data/settlements';
import { formatDate, formatKRW } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** 발주처 정산 확인 — 제출된 품의 목록 (T9) */
export default async function Page() {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const batches = (await listBatches(ctx.programId)).filter((b) => b.status !== 'draft');
  const waiting = batches.filter((b) => b.status === 'submitted');
  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">정산 확인</h1>
        <p className="mt-1 text-sm text-muted-foreground">{fmt('{operator}가 제출한 지급 품의를 확인합니다. 확인하면 포함된 케이스가 종결됩니다.', ctx.branding)}</p>
      </div>
      {waiting.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50/50 px-4 py-2 text-sm font-semibold text-amber-900">확인 대기 품의 {waiting.length}건</p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">제목</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2 text-right">건수</th>
              <th className="px-3 py-2 text-right">지급총액</th>
              <th className="px-3 py-2 text-right">원천징수</th>
              <th className="px-3 py-2 text-right">실지급</th>
              <th className="px-3 py-2">제출일</th>
              <th className="px-3 py-2">확인일</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  제출된 품의가 없습니다.
                </td>
              </tr>
            )}
            {batches.map((b) => (
              <tr key={b.id} className={`border-b last:border-0 ${b.status === 'submitted' ? 'bg-amber-50/30' : ''}`}>
                <td className="px-3 py-2 font-medium">
                  <Link href={`/institution/settlements/${b.id}`} className="hover:underline">
                    {b.title}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs">{BATCH_STATUS_LABELS[b.status] ?? b.status}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.itemCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(b.total_gross))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatKRW(Number(b.total_withholding))}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKRW(Number(b.total_net))}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{formatDate(b.submitted_at)}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{formatDate(b.confirmed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
