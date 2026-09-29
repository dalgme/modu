'use client';

import { useState } from 'react';
import { FolderDown, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Manifest {
  zipName: string;
  files: { path: string; url: string }[];
  emptyCases: number;
}

/**
 * 컨설팅 보고서·관찰의견서 ZIP 받기 (2026-09-30).
 * 서버(`/api/files/report-bundle`)에서 파일 목록만 받고, 브라우저가 파일을 4개씩 내려받아 폴더 구조대로 ZIP 으로 묶는다.
 * 큰 라운드 전체도 서버 한도(응답 4.5MB·60초) 없이 받을 수 있다. 진행률을 버튼에 표시한다.
 */
export function BundleDownloadButton({
  scope,
  id,
  mentorId,
  label,
  variant = 'outline',
  size = 'sm',
  className,
}: {
  scope: 'case' | 'mentor' | 'group';
  id: string;
  mentorId?: string | null;
  label: string;
  variant?: 'outline' | 'default' | 'secondary';
  size?: 'sm' | 'xs';
  className?: string;
}) {
  const { toast } = useToast();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const busy = progress !== null;

  const run = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      const qs = new URLSearchParams({ scope, id, ...(mentorId ? { mentor: mentorId } : {}) });
      const res = await fetch(`/api/files/report-bundle?${qs.toString()}`, { credentials: 'same-origin' });
      const body = (await res.json().catch(() => ({}))) as Partial<Manifest> & { error?: string };
      if (!res.ok || !body.files) {
        toast({ title: body.error ?? '파일 목록을 불러오지 못했습니다.', variant: 'destructive' });
        return;
      }
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const files = body.files;
      setProgress({ done: 0, total: files.length });
      let done = 0;
      let failed = 0;
      const queue = [...files];
      const worker = async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          try {
            const r = await fetch(f.url);
            if (!r.ok) throw new Error(String(r.status));
            zip.file(f.path, await r.blob());
          } catch {
            failed += 1;
          }
          done += 1;
          setProgress({ done, total: files.length });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      if (failed === files.length) {
        toast({ title: '파일을 받지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.', variant: 'destructive' });
        return;
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = body.zipName ?? '컨설팅보고서.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      toast({
        title: `ZIP 저장: 파일 ${files.length - failed}개`,
        description: [failed ? `받지 못한 파일 ${failed}개` : '', body.emptyCases ? `보고서가 아직 없는 멘티 ${body.emptyCases}명은 빠졌습니다.` : ''].filter(Boolean).join(' · ') || undefined,
      });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'ZIP 을 만들지 못했습니다.', variant: 'destructive' });
    } finally {
      setProgress(null);
    }
  };

  return (
    <Button type="button" variant={variant} size="sm" onClick={run} disabled={busy} className={cn('gap-1', size === 'xs' && 'h-7 px-2 text-xs', className)}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderDown className="h-3.5 w-3.5" />}
      {busy ? (progress.total ? `받는 중 ${progress.done}/${progress.total}` : '목록 준비 중…') : label}
    </Button>
  );
}
