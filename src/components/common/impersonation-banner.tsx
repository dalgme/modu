import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

import { getImpersonation } from '@/lib/auth/impersonation';
import { stopViewAsAction } from '@/lib/auth/impersonation-actions';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 대행(view-as) 중임을 모든 화면 상단에 상시 노출한다.
 * 대행이 아니면 아무것도 렌더하지 않는다.
 *
 * 이 화면의 작업은 '실제로' 처리되므로, 실행자가 대행 중임을 잊지 않도록
 * 레이아웃 최상단에 두고 종료 버튼을 함께 제공한다.
 * P31: 작업 중 케이스·복귀 경로 표시, 휴대폰에서는 한 줄 + 하단 고정 [대행 종료] 버튼(스크롤해도 보임).
 */
export async function ImpersonationBanner() {
  const imp = await getImpersonation();
  if (!imp) return null;

  const remainMin = Math.max(0, Math.round((new Date(imp.expiresAt).getTime() - Date.now()) / 60000));
  let caseLabel: string | null = null;
  if (imp.caseId) {
    const { data } = await createAdminClient().from('cases').select('owner_name, business_name').eq('id', imp.caseId).maybeSingle();
    if (data) caseLabel = data.business_name && data.business_name !== data.owner_name ? `${data.owner_name}/${data.business_name}` : data.owner_name;
  }
  const caseHref = imp.caseId ? (imp.target.role === 'mentor' ? `/mentor/cases/${imp.caseId}` : '/mentee/rounds') : null;
  const backLabel = imp.returnTo?.startsWith('/nextlab/cases/') ? '종료하고 케이스로' : imp.actorIsPlatformAdmin ? '종료하고 콘솔로' : '종료하고 명단으로';

  return (
    <>
      {/* sticky 로 두면 앱 헤더(sticky top-0 z-40)를 덮어 내비게이션이 가려진다 → 문서 흐름 상단에 고정 배치. */}
      <div className="relative z-50 border-b-2 border-amber-500 bg-amber-100 px-4 py-2 dark:border-amber-600 dark:bg-amber-950/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <span className="font-bold text-amber-900 dark:text-amber-200">
            {imp.target.name} {ROLE_LABELS[imp.target.role]} 대행 중
          </span>
          {caseLabel && caseHref && (
            <Link href={caseHref} className="rounded bg-amber-200/70 px-2 py-0.5 text-xs font-medium text-amber-900 underline-offset-2 hover:underline dark:bg-amber-900/50 dark:text-amber-100">
              {caseLabel} 작업 중
            </Link>
          )}
          <span className="hidden text-amber-800/90 dark:text-amber-300/90 sm:inline">
            이 화면의 작업은 실제로 처리되며, 실행자({imp.actorIsPlatformAdmin ? '플랫폼 관리자' : '운영사'})가 감사기록에 남습니다.
          </span>
          <span className="hidden text-xs text-amber-700/80 dark:text-amber-400/80 sm:inline">남은 시간 약 {remainMin}분</span>
          <form action={stopViewAsAction} className="ml-auto">
            <button
              type="submit"
              className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-800"
            >
              {backLabel}
            </button>
          </form>
        </div>
      </div>
      {/* 휴대폰: 스크롤해도 대행 종료가 보이도록 하단 탭바 위에 고정 (P31) */}
      <form action={stopViewAsAction} className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-3 z-50 sm:hidden">
        <button
          type="submit"
          className="flex h-11 items-center gap-1.5 rounded-full bg-amber-700 px-4 text-xs font-semibold text-white shadow-lg ring-2 ring-white/70"
          aria-label="대행 종료"
        >
          <ShieldAlert className="h-4 w-4" />
          대행 종료
        </button>
      </form>
    </>
  );
}
