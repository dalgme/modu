'use client';

import { useState } from 'react';
import { Code2 } from 'lucide-react';

import { describeAudit, auditSource } from '@/lib/audit/describe';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/utils/format';

export interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
  actor_id: string | null;
  actorName: string | null;
  program_id?: string | null;
  programName?: string | null;
  onBehalfOfName?: string | null;
}

/**
 * 감사로그 표 — 기본 표는 사람에게 설명하는 문장, [소스] 버튼을 누르면 액션 코드·대상·메타데이터 원본을 팝업으로 보여준다.
 * showProgram: 통합(플랫폼) 화면에서 행사 컬럼 표시
 */
export function AuditTable({ rows, showProgram = false }: { rows: AuditRow[]; showProgram?: boolean }) {
  const [open, setOpen] = useState<AuditRow | null>(null);
  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">시각</th>
              {showProgram && <th className="px-3 py-2">행사</th>}
              <th className="px-3 py-2">수행자</th>
              <th className="px-3 py-2">구분</th>
              <th className="px-3 py-2">내용</th>
              <th className="px-3 py-2 text-right">소스</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={showProgram ? 6 : 5} className="px-3 py-6 text-center text-muted-foreground">기록이 없습니다.</td>
              </tr>
            )}
            {rows.map((l) => {
              const d = describeAudit(l);
              return (
                <tr key={l.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">{formatDateTime(l.created_at)}</td>
                  {showProgram && (
                    <td className="px-3 py-2 text-xs">
                      {l.programName ?? <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">플랫폼</span>}
                    </td>
                  )}
                  <td className="px-3 py-2 text-xs">
                    {l.actorName ?? '시스템'}
                    {l.onBehalfOfName && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{l.onBehalfOfName} 대행</span>}
                  </td>
                  <td className="px-3 py-2"><span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{d.category}</span></td>
                  <td className="px-3 py-2">{d.text}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpen(l)} title="원본 로그 보기">
                      <Code2 className="h-3.5 w-3.5" /> 소스
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>로그 원본</DialogTitle>
            <DialogDescription>{open ? describeAudit(open).text : ''}</DialogDescription>
          </DialogHeader>
          {open && (
            <div className="flex flex-col gap-2 text-xs">
              <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1">
                <dt className="text-muted-foreground">액션 코드</dt><dd className="font-mono">{open.action}</dd>
                <dt className="text-muted-foreground">대상</dt><dd className="font-mono">{open.entity_type ?? '-'}{open.entity_id ? ` · ${open.entity_id}` : ''}</dd>
                <dt className="text-muted-foreground">수행자 id</dt><dd className="font-mono">{open.actor_id ?? '(시스템)'}</dd>
                {showProgram && (<><dt className="text-muted-foreground">행사 id</dt><dd className="font-mono">{open.program_id ?? '(플랫폼)'}</dd></>)}
              </dl>
              <pre className="max-h-[50vh] overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed">{auditSource(open)}</pre>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
