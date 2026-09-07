import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProgramWithStaff } from '@/lib/platform/data';
import { AddStaffForm } from '@/components/platform/program-actions';
import { formatDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  const found = await getProgramWithStaff(params.id);
  if (!found) notFound();
  const { program: p, staff } = found;
  return (
    <main className="flex flex-col gap-5">
      <div>
        <Link href="/platform" className="text-sm text-muted-foreground hover:underline">← 행사 목록</Link>
        <h1 className="mt-1 text-2xl font-semibold">{p.name} <span className="ml-2 font-mono text-sm text-muted-foreground">{p.slug}</span></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          발주처 {p.client_name} · 운영사 {p.operator_name} · {formatDate(p.starts_on)} ~ {formatDate(p.ends_on)} · {p.status === 'active' ? '진행 중' : '종료'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">브랜딩·그룹·단가 등 세부 설정은 이 행사의 운영사 계정으로 들어가 운영 설정에서 관리합니다. 플랫폼 관리자도 허브에서 이 행사로 진입할 수 있습니다.</p>
      </div>
      <section className="rounded-xl border bg-background p-4">
        <h2 className="text-base font-semibold">스태프 계정 (운영사 · 발주처)</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {staff.length === 0 && <li className="text-muted-foreground">스태프가 없습니다. 아래에서 첫 운영사 계정을 발급하세요.</li>}
          {staff.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{u.role === 'nextlab' ? '운영사' : '발주처'}</span>
              <b>{u.name}</b> <span className="text-xs text-muted-foreground">{u.email}</span>
              {!u.is_active && <span className="text-xs text-destructive">비활성</span>}
            </li>
          ))}
        </ul>
        <AddStaffForm programId={p.id} />
      </section>
    </main>
  );
}
