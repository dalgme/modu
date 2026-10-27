import { FileSpreadsheet } from 'lucide-react';

import { createAdminClient } from '@/lib/supabase/admin';
import { ExcelButton } from '@/components/common/excel-button';

/**
 * 멘토링 실적 엑셀 바 (2026-10-27) — 서버 컴포넌트, 링크만.
 * ① 멘토링 수당 산출내역(라운드별, 수식·색) ② 멘티별 멘토링 현황.
 * 범위가 그룹이면 그 그룹, 행사 전체면 수당 산출내역은 라운드마다 버튼을 보인다.
 */
export async function MentoringExportBar({ programId, groupId, groupName }: { programId: string; groupId: string | null; groupName: string | null }) {
  const admin = createAdminClient();
  const { data } = groupId ? { data: null } : await admin.from('support_types').select('id, name').eq('program_id', programId).order('sort_order');
  const groups = data ?? [];
  const href = (kind: 'allowance' | 'mentee', g?: string) => `/api/nextlab/mentoring-export?kind=${kind}${g ? `&group=${g}` : ''}`;
  return (
    <section className="flex flex-col gap-2 rounded-xl border-2 border-lime-300 bg-lime-50/40 p-3 dark:border-lime-800 dark:bg-lime-950/20">
      <div className="flex items-center gap-1.5">
        <FileSpreadsheet className="h-4 w-4 text-lime-700" />
        <h2 className="text-sm font-semibold">멘토링 실적 엑셀</h2>
        <span className="text-xs text-muted-foreground">— 보고서까지 등록된 회차 기준, 받을 때마다 최신 데이터로 만듭니다.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {groupId ? (
          <ExcelButton href={href('allowance', groupId)} label={`멘토링 수당 산출내역 (${groupName ?? '현재 그룹'})`} title="총괄 · 멘토별 요약 · 회차별 상세 · 단가표 — 수식과 색이 들어간 엑셀" />
        ) : (
          groups.map((g) => <ExcelButton key={g.id} href={href('allowance', g.id)} label={`수당 산출내역 · ${g.name}`} title="총괄 · 멘토별 요약 · 회차별 상세 · 단가표" />)
        )}
        <ExcelButton href={href('mentee', groupId ?? undefined)} label={`멘티별 멘토링 현황 (${groupId ? (groupName ?? '현재 그룹') : '행사 전체'})`} title="멘티마다 배정 멘토 · 온/오프라인 회차와 시간 · 아이템 · 운영사" />
      </div>
    </section>
  );
}
