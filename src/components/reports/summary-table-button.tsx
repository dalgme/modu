'use client';

import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';

import type { TopicJobList } from '@/lib/files/report-topic-shared';
import { saveReportTopicsAction } from '@/lib/files/report-topics-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * 멘토링 총괄표 받기 (2026-11-18) — [주요 내용] 칸을 채우려고, 아직 읽지 않은(또는 바뀐) 회차 보고서의
 * "멘토링 주제" 칸을 이 브라우저에서 읽어 저장한 뒤 엑셀을 받는다. 한 번 읽은 보고서는 다시 읽지 않는다.
 */
export function SummaryTableButton({ groupId, label }: { groupId: string | null; label: string }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<string | null>(null);

  const run = async () => {
    setStatus('보고서 확인 중…');
    let missing = 0;
    try {
      const q = groupId ? `?group=${groupId}` : '';
      const reader = await import('@/lib/files/report-topic');
      for (let loop = 0; loop < 30; loop++) {
        const res = await fetch(`/api/files/report-topics${q}`, { credentials: 'same-origin' });
        const body = (await res.json().catch(() => ({}))) as Partial<TopicJobList> & { error?: string };
        if (!res.ok || !body.jobs) throw new Error(body.error ?? '보고서 목록을 불러오지 못했습니다.');
        if (body.jobs.length === 0) break;
        const results: { logId: string; path: string; topic: string | null }[] = [];
        for (let i = 0; i < body.jobs.length; i++) {
          const job = body.jobs[i]!;
          setStatus(`보고서 '멘토링 주제' 읽는 중 ${(body.done ?? 0) + i + 1}/${body.total ?? '?'}`);
          let topic: string | null = null;
          try {
            const f = await fetch(job.url);
            if (f.ok) {
              const bytes = new Uint8Array(await f.arrayBuffer());
              topic = job.kind === 'pdf' ? await reader.topicFromPdf(bytes) : job.kind === 'hwp' ? await reader.topicFromHwp(bytes) : null;
            }
          } catch {
            topic = null;
          }
          if (!topic) missing += 1;
          results.push({ logId: job.logId, path: job.path, topic });
        }
        const saved = await saveReportTopicsAction(results);
        if (!saved.ok) throw new Error(saved.error);
        if (saved.saved === 0 || (body.remaining ?? 0) === 0) break;
      }
      setStatus('엑셀 만드는 중…');
      const a = document.createElement('a');
      a.href = `/api/nextlab/mentoring-export?kind=summary${groupId ? `&group=${groupId}` : ''}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (missing > 0) toast({ title: `총괄표를 받습니다. 이번에 읽은 보고서 중 ${missing}건은 '멘토링 주제' 칸을 찾지 못해 [주요 내용]이 비어 있습니다 — 엑셀에서 직접 채워 주세요.` });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : '총괄표를 만들지 못했습니다.', variant: 'destructive' });
    } finally {
      setTimeout(() => setStatus(null), 1500);
    }
  };

  return (
    <Button type="button" size="sm" onClick={run} disabled={status !== null} className="gap-1.5 bg-lime-500 text-lime-950 hover:bg-lime-400" title="회차 1건 = 1줄 · 주요 내용 = 보고서의 '멘토링 주제' 칸">
      {status ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
      {status ?? label}
    </Button>
  );
}
