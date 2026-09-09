'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ToggleLeft, ToggleRight } from 'lucide-react';

import { setProgramFeatureAction } from '@/lib/platform/actions';
import { FEATURE_DEFS, FEATURE_KEYS, type FeatureKey } from '@/lib/platform/features';
import { useToast } from '@/hooks/use-toast';

/**
 * 행사 기능 플래그 (플랫폼 통합관리자 전용) — 기본 전부 비활성.
 * 비활성 기능은 운영사 설정·해당 역할 화면에 노출되지 않고 서버 액션도 차단된다.
 */
export function ProgramFeaturesForm({ programId, features }: { programId: string; features: Record<string, boolean> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<FeatureKey | null>(null);

  const toggle = (key: FeatureKey, next: boolean) => {
    if (next && !confirm(`'${FEATURE_DEFS[key].label}' 기능을 이 행사에서 활성화할까요? 운영사 설정과 관련 화면에 즉시 노출됩니다.`)) return;
    if (!next && !confirm(`'${FEATURE_DEFS[key].label}' 기능을 비활성화할까요? 관련 탭·화면이 숨겨지고 제출도 차단됩니다. (저장된 데이터는 유지)`)) return;
    setBusyKey(key);
    start(async () => {
      const r = await setProgramFeatureAction(programId, key, next);
      setBusyKey(null);
      if (!r.ok) {
        toast({ title: r.error, variant: 'destructive' });
        return;
      }
      toast({ title: `'${FEATURE_DEFS[key].label}' 기능을 ${next ? '활성화' : '비활성화'}했습니다.` });
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {FEATURE_KEYS.map((key) => {
        const on = features[key] === true;
        return (
          <div key={key} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${on ? 'border-emerald-300 bg-emerald-50/40' : 'bg-muted/20'}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {FEATURE_DEFS[key].label}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}>
                  {on ? '활성' : '비활성'}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{FEATURE_DEFS[key].description}</p>
            </div>
            <button
              type="button"
              onClick={() => toggle(key, !on)}
              disabled={pending && busyKey === key}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${on ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' : 'text-muted-foreground hover:bg-accent'}`}
            >
              {on ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
              {pending && busyKey === key ? '변경 중…' : on ? '비활성화' : '활성화'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
