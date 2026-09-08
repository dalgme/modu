import { listPlatformAudit } from '@/lib/platform/data';
import { listAllPrograms } from '@/lib/platform/data';
import { AuditTable } from '@/components/audit/audit-table';

export const dynamic = 'force-dynamic';

/** 통합 감사로그 — 행사 무관 전체. 플랫폼 콘솔에서 한 행위는 program_id 가 비어 있다(= '플랫폼'). */
export default async function Page({ searchParams }: { searchParams: { program?: string; action?: string; limit?: string } }) {
  const limit = Math.min(Math.max(Number(searchParams.limit) || 200, 50), 500);
  const [{ rows, actions }, programs] = await Promise.all([listPlatformAudit({ programId: searchParams.program, action: searchParams.action, limit }), listAllPrograms()]);
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">통합 감사로그</h1>
        <p className="mt-1 text-sm text-muted-foreground">모든 행사의 관리자 액션 이력(INSERT-only). 표에는 로그의 의미를 풀어 쓰고, [소스] 를 누르면 액션 코드·대상·메타데이터 원본을 팝업으로 봅니다.</p>
      </div>
      <form className="grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-4" method="get">
        <select name="program" defaultValue={searchParams.program ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">모든 행사 + 플랫폼</option>
          <option value="platform">플랫폼 콘솔 행위만</option>
          {programs.map(({ program: p }) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select name="action" defaultValue={searchParams.action ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">모든 액션</option>
          {actions.map((a) => (
            <option key={a} value={a}>{a}.*</option>
          ))}
        </select>
        <select name="limit" defaultValue={String(limit)} className="h-9 rounded-md border bg-background px-2 text-sm">
          {[100, 200, 500].map((n) => (
            <option key={n} value={n}>최근 {n}건</option>
          ))}
        </select>
        <button type="submit" className="h-9 rounded-md bg-violet-600 px-3 text-sm font-semibold text-white hover:bg-violet-700">조회</button>
      </form>
      <AuditTable rows={rows} showProgram />
    </main>
  );
}
