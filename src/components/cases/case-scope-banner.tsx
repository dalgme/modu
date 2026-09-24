import { AlertTriangle } from 'lucide-react';

/**
 * 담당 외 그룹 케이스 안내 (2026-09-24) — 현재 범위(컨텍스트 그룹) 또는 내 담당 그룹(program_members.duty_groups)에
 * 이 케이스의 그룹이 포함되지 않으면 상단에 앰버 배너를 띄운다. 열람·작업은 막지 않는다(실수 방지 안내).
 */
export function CaseScopeBanner({ groupName, reason }: { groupName: string | null; reason: 'scope' | 'duty' }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <b>담당 외 그룹({groupName ?? '그룹 미상'}) 케이스입니다.</b>{' '}
        <span className="text-xs">
          {reason === 'scope' ? '현재 범위 스위처의 그룹과 다릅니다. 이 케이스에서 한 작업은 그 그룹에 반영됩니다.' : '내 담당 그룹으로 지정되지 않은 그룹입니다. 담당자와 확인한 뒤 작업하세요.'}
        </span>
      </div>
    </div>
  );
}
