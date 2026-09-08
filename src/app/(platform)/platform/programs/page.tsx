import Link from 'next/link';

import { listAllPrograms } from '@/lib/platform/data';
import { ProgramStatusButton } from '@/components/platform/program-actions';
import { formatDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const programs = await listAllPrograms();
  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">행사 관리</h1>
          <p className="mt-1 text-sm text-muted-foreground">이 플랫폼에 개설된 모든 행사입니다. 행사마다 계정·그룹·케이스·단가·브랜딩이 완전히 분리되며, 세부 설정은 각 행사의 운영사가 운영 설정에서 관리합니다.</p>
        </div>
        <Link href="/platform/new" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">+ 행사 개설</Link>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">행사</th><th className="px-3 py-2">관리코드</th><th className="px-3 py-2">발주처 / 운영사</th><th className="px-3 py-2">기간</th><th className="px-3 py-2 text-right">그룹</th><th className="px-3 py-2 text-right">케이스</th><th className="px-3 py-2">계정(운영/발주/멘토/멘티)</th><th className="px-3 py-2">상태</th><th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {programs.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">행사가 없습니다.</td></tr>}
            {programs.map(({ program: p, groups, cases, members }) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium"><Link href={`/platform/programs/${p.id}`} className="hover:underline">{p.name}</Link></td>
                <td className="px-3 py-2 font-mono text-xs">{p.slug}</td>
                <td className="px-3 py-2 text-xs">{p.client_name} / {p.operator_name}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{formatDate(p.starts_on)} ~ {formatDate(p.ends_on)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{groups}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cases}</td>
                <td className="px-3 py-2 text-xs tabular-nums">{members.nextlab} / {members.institution} / {members.mentor} / {members.mentee}</td>
                <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>{p.status === 'active' ? '진행 중' : '종료'}</span></td>
                <td className="px-3 py-2 text-right"><ProgramStatusButton programId={p.id} status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
