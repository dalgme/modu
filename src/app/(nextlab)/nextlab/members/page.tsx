import { requireNextlab } from '@/lib/auth/guards';
import { listMembers } from '@/lib/data/members';
import { MembersManager } from '@/components/nextlab/members-manager';

export default async function Page() {
  await requireNextlab();
  const members = await listMembers();

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">회원 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          진흥원 · 넥스트랩 · 멘토 · 멘티 계정을 발급·관리하고, 각 회원 화면을 열람합니다.
        </p>
      </div>
      <MembersManager
        members={members.map((m) => ({
          id: m.id,
          email: m.email,
          name: m.name,
          phone: m.phone,
          role: m.role,
          is_active: m.is_active,
          must_change_password: m.must_change_password,
        }))}
      />
    </main>
  );
}
