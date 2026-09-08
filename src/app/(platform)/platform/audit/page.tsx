import { listPlatformAudit } from '@/lib/platform/data';
import { listAllPrograms } from '@/lib/platform/data';
import { formatDateTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

/** 통합 감사로그 — 행사 무관 전체. 플랫폼 콘솔에서 한 행위는 program_id 가 비어 있다(= '플랫폼'). */
export default async function Page({ searchParams }: { searchParams: { program?: string; action?: string; limit?: string } }) {
  const limit = Math.min(Math.max(Number(searchParams.limit) || 200, 50), 500);
  const [{ rows, actions }, programs] = await Promise.all([listPlatformAudit({ programId: searchParams.program, action: searchParams.action, limit }), listAllPrograms()]);
  const short = (m: unknown) => {
    if (!m || typeof m !== 'object') return '';
    const s = JSON.stringify(m);
    return s.length > 140 ? `${s.slice(0, 140)}…` : s;
  };
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">통합 감사로그</h1>
        <p className="mt-1 text-sm text-muted-foreground">모든 행사의 관리자 액션 이력(INSERT-only). 행사 안 감사로그는 그 행사 것만 보이지만 여기서는 전체를 봅니다.</p>
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
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">시각</th><th className="px-3 py-2">행사</th><th className="px-3 py-2">수행자</th><th className="px-3 py-2">액션</th><th className="px-3 py-2">대상</th><th className="px-3 py-2">내용</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">기록이 없습니다.</td></tr>}
            {rows.map((l) => (
              <tr key={l.id} className="border-b align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-1.5 text-xs tabular-nums text-muted-foreground">{formatDateTime(l.created_at)}</td>
                <td className="px-3 py-1.5 text-xs">{l.programName ?? <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">플랫폼</span>}</td>
                <td className="px-3 py-1.5 text-xs">
                  {l.actorName ?? '시스템'}
                  {l.onBehalfOfName && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{l.onBehalfOfName} 대행</span>}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">{l.action}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{l.entity_type ?? ''}{l.entity_id ? ` ${l.entity_id.slice(0, 8)}` : ''}</td>
                <td className="max-w-md px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{short(l.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
