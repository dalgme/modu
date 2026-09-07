import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listSupportTypes } from '@/lib/programs/data';
import { listCases } from '@/lib/data/cases';
import { SuccessionPanel } from '@/components/nextlab/succession-panel';

export const dynamic = 'force-dynamic';

/** 그룹 간 승계 개설 (docs §8) */
export default async function Page({ searchParams }: { searchParams: { source?: string } }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const groups = await listSupportTypes(ctx.programId);
  const source = groups.find((g) => g.id === searchParams.source)?.id ?? groups[0]?.id ?? '';
  const cases = source ? await listCases({ programId: ctx.programId, supportTypeId: source }) : [];
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">승계 개설</h1>
        <p className="mt-1 text-sm text-muted-foreground">이전 단계 그룹의 멘티를 다음 그룹으로 승계합니다. 새 케이스를 만들고 이전 케이스를 연결(predecessor)하며, 이전 그룹의 회차·서류·정산은 그대로 보존됩니다.</p>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">사업그룹이 없습니다.</p>
      ) : (
        <SuccessionPanel groups={groups.map((g) => ({ id: g.id, name: g.name, code: g.code, status: g.status, predecessor_support_type_id: g.predecessor_support_type_id }))} sourceGroupId={source} cases={cases} />
      )}
    </main>
  );
}
