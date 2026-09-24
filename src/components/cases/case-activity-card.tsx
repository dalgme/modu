'use client';

import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CaseMemoForm } from '@/components/cases/case-memo';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export interface CaseActivityItem {
  id: string;
  at: string;
  /** status: 상태 이력 / audit: 감사로그 / memo: 내부 메모 */
  kind: 'status' | 'audit' | 'memo';
  actorName: string | null;
  category: string;
  text: string;
  /** 대행(view-as) 중 남은 기록 — metadata.via === 'view-as' (P31) */
  viaViewAs?: boolean;
}

/**
 * [조치 이력] 카드 (2026-09-24) — case_status_history + audit_logs(entity_type='cases') + 내부 메모(case.memo) 를 시각 역순으로 합친다.
 * 최근 50건, 접기/펼치기. 메모는 운영사 내부용이라 발주처 화면에는 쓰지 않는다.
 */
export function CaseActivityCard({ caseId, items, canMemo }: { caseId: string; items: CaseActivityItem[]; canMemo: boolean }) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 10);
  return (
    <Card id="activity" className="scroll-mt-40">
      <CardHeader className="pb-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> 조치 이력 · 내부 메모
            <span className="text-xs font-normal text-muted-foreground">{items.length}건</span>
          </CardTitle>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="flex flex-col gap-4">
          <CaseMemoForm caseId={caseId} canWrite={canMemo} />
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 기록이 없습니다.</p>
          ) : (
            <ol className="flex flex-col gap-2 border-l pl-3">
              {visible.map((it) => (
                <li key={it.id} className={cn('flex flex-col gap-0.5 text-sm', it.kind === 'memo' && 'rounded-md bg-amber-50/70 px-2 py-1 dark:bg-amber-950/20')}>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{formatDateTime(it.at)}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5">{it.category}</span>
                    <span>{it.actorName ?? '시스템'}</span>
                    {it.viaViewAs && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" title="운영사 담당자가 회원 화면을 대행하며 수행한 작업">대행</span>}
                  </div>
                  <p className={cn('whitespace-pre-wrap', it.kind === 'memo' && 'text-amber-900 dark:text-amber-100')}>{it.text}</p>
                </li>
              ))}
            </ol>
          )}
          {items.length > 10 && (
            <button type="button" className="self-start text-xs text-primary underline underline-offset-2" onClick={() => setShowAll((v) => !v)}>
              {showAll ? '최근 10건만 보기' : `전체 ${items.length}건 보기`}
            </button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
