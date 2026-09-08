import Link from 'next/link';

import { requireNextlab } from '@/lib/auth/guards';
import { Button } from '@/components/ui/button';
import { requireContext } from '@/lib/programs/context';
import { listProgramMembers } from '@/lib/data/members';
import { listRosterColumns } from '@/lib/data/roster-columns';
import { MembersManager } from '@/components/nextlab/members-manager';

export default async function Page() {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const [members, roster] = await Promise.all([
    listProgramMembers(ctx.programId),
    listRosterColumns(ctx.programId),
  ]);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">회원 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <b>{ctx.program.name}</b> 소속 회원입니다. 역할은 이 행사 안에서의 역할이며, 같은 사람이 다른 행사에서는 다른 역할(예: 멘토 ↔ 멘티)을 가질 수 있습니다.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/nextlab/members/import">엑셀 일괄 등록</Link>
        </Button>
      </div>
      <MembersManager
        members={members.map((m) => ({
          id: m.id,
          email: m.email,
          name: m.name,
          phone: m.phone,
          role: m.role,
          primaryRole: m.primaryRole,
          memberActive: m.memberActive,
          position: m.position,
          grade: m.grade,
          duty: m.duty,
          organization: m.organization,
          assignedCount: m.assignedCount,
          guideSentAt: m.guideSentAt,
          is_active: m.is_active,
          must_change_password: m.must_change_password,
        }))}
        rosterColumns={roster.columns.map((c) => ({ id: c.id, target: c.target, name: c.name }))}
        rosterValues={roster.values}
      />
    </main>
  );
}
