import { ShieldAlert } from 'lucide-react';

import { getImpersonation } from '@/lib/auth/impersonation';
import { stopViewAsAction } from '@/lib/auth/impersonation-actions';

/**
 * 대행(view-as) 중임을 모든 화면 상단에 상시 노출한다.
 * 대행이 아니면 아무것도 렌더하지 않는다.
 *
 * 이 화면의 작업은 '실제로' 처리되므로, 실행자가 대행 중임을 잊지 않도록
 * 레이아웃 최상단에 두고 종료 버튼을 함께 제공한다.
 */
export async function ImpersonationBanner() {
  const imp = await getImpersonation();
  if (!imp) return null;

  const remainMin = Math.max(
    0,
    Math.round((new Date(imp.expiresAt).getTime() - Date.now()) / 60000),
  );

  return (
    // sticky 로 두면 앱 헤더(sticky top-0 z-40)를 덮어 내비게이션이 가려진다 → 문서 흐름 상단에 고정 배치.
    <div className="relative z-50 border-b-2 border-amber-500 bg-amber-100 px-4 py-2 dark:border-amber-600 dark:bg-amber-950/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
        <span className="font-bold text-amber-900 dark:text-amber-200">
          {imp.target.name} 멘토 대행 중
        </span>
        <span className="text-amber-800/90 dark:text-amber-300/90">
          이 화면의 작업은 실제로 처리되며, 실행자(운영사)가 감사기록에 남습니다.
        </span>
        <span className="text-xs text-amber-700/80 dark:text-amber-400/80">
          남은 시간 약 {remainMin}분
        </span>
        <form action={stopViewAsAction} className="ml-auto">
          <button
            type="submit"
            className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-800"
          >
            대행 종료
          </button>
        </form>
      </div>
    </div>
  );
}
