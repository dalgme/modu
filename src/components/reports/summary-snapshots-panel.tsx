'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileDown, FilePlus2, Eye } from 'lucide-react';

import type { SnapshotListItem } from '@/lib/reports/summary-types';
import { createSummarySnapshotAction } from '@/lib/reports/summary-actions';
import { SUMMARY_FORMATS } from '@/lib/reports/summary-formats';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

export function SummarySnapshotsPanel({ snapshots }: { snapshots: SnapshotListItem[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-background p-4">
        <div className="flex min-w-64 flex-1 flex-col gap-1">
          <label htmlFor="snap-title" className="text-sm font-medium">리포트 제목 (비우면 자동)</label>
          <Input id="snap-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 상반기 중간 결과보고" />
        </div>
        <Button
          className="gap-1"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createSummarySnapshotAction(title);
              if (!r.ok) {
                toast({ title: r.error, variant: 'destructive' });
                return;
              }
              setTitle('');
              toast({ title: '종합결과리포트를 생성했습니다 (지금 시점의 데이터로 고정).' });
              router.refresh();
            })
          }
        >
          <FilePlus2 className="h-4 w-4" /> {pending ? '생성 중…' : '지금 기준으로 생성'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2">제목</th>
              <th className="px-3 py-2">범위</th>
              <th className="px-3 py-2">생성</th>
              <th className="px-3 py-2 text-right">케이스 / 종결</th>
              <th className="px-3 py-2 text-right">보기 · 저장</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">아직 생성된 리포트가 없습니다. 위에서 첫 리포트를 생성하세요.</td></tr>
            )}
            {snapshots.map((s) => (
              <tr key={s.id} className="border-b align-top last:border-0">
                <td className="px-3 py-2 font-medium">{s.title}</td>
                <td className="px-3 py-2 text-xs">{s.groupName ?? '행사 전체'}</td>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">{formatDateTime(s.generatedAt)}{s.generatedByName ? ` · ${s.generatedByName}` : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.cases} / {s.closed}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
                      <a href={`/api/reports/summary/${s.id}/export?format=html&inline=1`} target="_blank" rel="noreferrer"><Eye className="h-3.5 w-3.5" /> 보기</a>
                    </Button>
                    {SUMMARY_FORMATS.map((f) => (
                      <Button key={f.key} asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" title={`${f.label} 로 저장`}>
                        <a href={`/api/reports/summary/${s.id}/export?format=${f.key}`}><FileDown className="h-3 w-3" /> {f.label}</a>
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">PDF 첫 생성은 10~20초 걸릴 수 있습니다. 발주처 담당자도 같은 링크로 열람·저장할 수 있습니다.</p>
    </div>
  );
}
