import { requireStaff } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { loadProgramAuditRows } from '@/lib/audit/rows';
import { AuditTable } from '@/components/audit/audit-table';

export const dynamic = 'force-dynamic';

/** 행사 감사로그 — 이 행사(program_id) 범위. 설명문 + [소스] 팝업 (플랫폼 통합 감사로그와 같은 표) */
export default async function Page() {
  const profile = await requireStaff();
  const ctx = await requireContext(profile);
  const rows = await loadProgramAuditRows(ctx.programId);

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">감사 로그</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.program.name} 의 관리자 액션 이력 (INSERT-only · 위변조 방지). 최근 200건. [소스] 를 누르면 원본 로그를 봅니다.
        </p>
      </div>
      <AuditTable rows={rows} />
    </main>
  );
}
