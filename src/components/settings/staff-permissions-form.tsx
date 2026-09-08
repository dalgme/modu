'use client';

import { useState, useTransition } from 'react';

import { CAPABILITIES, DEFAULT_GRANTS, GRADE_HINTS, GRADE_LABELS, STAFF_GRADES, resolveGrants, type CapabilityKey, type StaffGrade } from '@/lib/auth/capabilities';
import { updateStaffPermissionsAction } from '@/lib/settings/actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/** 운영 설정 — 담당 등급별 권한 (PL 은 항상 전체, PM·부PM·옵저버는 행사별로 조정) */
export function StaffPermissionsForm({ override, canEdit }: { override: unknown; canEdit: boolean }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const editable = STAFF_GRADES.filter((g) => g !== 'pl');
  const [grants, setGrants] = useState<Record<StaffGrade, Set<CapabilityKey>>>(() => {
    const o = {} as Record<StaffGrade, Set<CapabilityKey>>;
    for (const g of STAFF_GRADES) o[g] = new Set(resolveGrants(g, override));
    return o;
  });
  const toggle = (g: StaffGrade, k: CapabilityKey) =>
    setGrants((prev) => {
      const n = { ...prev, [g]: new Set(prev[g]) };
      if (n[g].has(k)) n[g].delete(k);
      else n[g].add(k);
      return n;
    });
  const reset = () =>
    setGrants((prev) => {
      const n = { ...prev };
      for (const g of editable) n[g] = new Set(DEFAULT_GRANTS[g]);
      return n;
    });
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4">
      <div>
        <p className="text-sm font-semibold">담당 등급별 권한</p>
        <p className="text-xs text-muted-foreground">
          메인 담당자(PL)는 항상 전체 권한입니다. PM·부PM·옵저버는 이 행사에서 허용할 권한을 체크합니다. 옵저버는 현황 확인·자문 계층이라 기본은 리포트만 허용됩니다.
          {!canEdit && <b className="ml-1 text-amber-700">변경은 메인 담당자(PL)만 할 수 있습니다.</b>}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-2 py-2">권한</th>
              {STAFF_GRADES.map((g) => (
                <th key={g} className="px-2 py-2 text-center" title={GRADE_HINTS[g]}>{GRADE_LABELS[g]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((c) => (
              <tr key={c.key} className="border-b last:border-0">
                <td className="px-2 py-1.5">
                  <b>{c.label}</b>
                  <p className="text-[11px] text-muted-foreground">{c.desc}</p>
                </td>
                {STAFF_GRADES.map((g) => (
                  <td key={g} className="px-2 py-1.5 text-center">
                    <input type="checkbox" checked={grants[g].has(c.key)} disabled={g === 'pl' || !canEdit || pending} onChange={() => toggle(g, c.key)} aria-label={`${GRADE_LABELS[g]} ${c.label}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={reset}>기본값으로</Button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const payload: Record<string, string[]> = {};
                for (const g of editable) payload[g] = Array.from(grants[g]);
                const r = await updateStaffPermissionsAction(payload);
                toast(r.ok ? { title: '담당 권한을 저장했습니다.' } : { title: r.error, variant: 'destructive' });
              })
            }
          >
            {pending ? '저장 중…' : '저장'}
          </Button>
        </div>
      )}
    </div>
  );
}
