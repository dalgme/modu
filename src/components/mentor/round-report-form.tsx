'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp } from 'lucide-react';

import { registerRoundReportAction } from '@/lib/workflow/mentor-actions';
import { stageUpload, type StagedFile } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

/** 회차 2단계 — 실서류(멘토링 보고서) 등록. 웹 작성 또는 파일 업로드 + 사진 */
export function RoundReportForm({ caseId, logId, roundNo }: { caseId: string; logId: string; roundNo: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'web' | 'file'>('web');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [result, setResult] = useState('');
  const reportRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    start(async () => {
      try {
        let reportFile: StagedFile | null = null;
        if (kind === 'file') {
          const f = reportRef.current?.files?.[0];
          if (!f) {
            toast({ title: '보고서 파일을 선택하세요.', variant: 'destructive' });
            return;
          }
          reportFile = await stageUpload(f, 'documents');
        }
        const photos: string[] = [];
        for (const f of Array.from(photosRef.current?.files ?? []).slice(0, 10)) {
          photos.push((await stageUpload(f, 'photos')).stagingPath);
        }
        const r = await registerRoundReportAction({
          caseId,
          logId,
          topic,
          content: kind === 'web' ? content : undefined,
          result,
          reportFile,
          photoPaths: photos,
        });
        if (!r.ok) {
          toast({ title: r.error, variant: 'destructive' });
          return;
        }
        toast({ title: `${roundNo}회차 보고서를 등록했습니다.` });
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : '등록 실패', variant: 'destructive' });
      }
    });
  };

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1">
        <FileUp className="h-4 w-4" /> 보고서 등록 (2단계)
      </Button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-semibold">{roundNo}회차 — 2단계 · 실서류(보고서) 등록</p>
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={() => setKind('web')} className={`rounded-lg border px-3 py-1.5 ${kind === 'web' ? 'border-primary bg-background font-semibold' : ''}`}>
          보고서 웹 작성
        </button>
        <button type="button" onClick={() => setKind('file')} className={`rounded-lg border px-3 py-1.5 ${kind === 'file' ? 'border-primary bg-background font-semibold' : ''}`}>
          보고서 파일 업로드
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`rr-topic-${logId}`}>주제</Label>
        <Input id={`rr-topic-${logId}`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="이번 회차 주제" />
      </div>
      {kind === 'web' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`rr-content-${logId}`}>컨설팅 내용 *</Label>
          <Textarea id={`rr-content-${logId}`} rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="진행 내용, 논의 사항, 멘티 상황" />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Label>보고서 파일 *</Label>
          <Input ref={reportRef} type="file" accept=".pdf,.hwp,.hwpx,.doc,.docx,.png,.jpg,.jpeg" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`rr-result-${logId}`}>결과·다음 회차 계획</Label>
        <Textarea id={`rr-result-${logId}`} rows={3} value={result} onChange={(e) => setResult(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>사진 (최대 10장)</Label>
        <Input ref={photosRef} type="file" accept="image/*" multiple />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
          취소
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? '등록 중…' : '보고서 등록'}
        </Button>
      </div>
    </div>
  );
}
