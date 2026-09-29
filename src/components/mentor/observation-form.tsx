'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Lock, Upload } from 'lucide-react';

import { uploadObservationAction } from '@/lib/workflow/mentor-actions';
import { stageUpload } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { FileActions } from '@/components/files/file-preview';

/**
 * 관찰의견서 — **파일 업로드만** (2026-09-30: 웹 작성 폐지, observation_reports 는 임시 필드로 보존).
 * [파일 업로드]는 계획 회차 보고서를 모두 올린 뒤에만 열린다 — `uploadGate` 는 서버 게이트(uploadObservationFile)와 같은 observationUploadGate 결과.
 */
export function ObservationForm({
  caseId,
  file,
  editable,
  uploadGate = { ok: true, hint: '' },
}: {
  caseId: string;
  file: { id: string; name: string; url: string | null } | null;
  editable: boolean;
  uploadGate?: { ok: boolean; hint: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const upload = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return toast({ title: '파일을 선택하세요.', variant: 'destructive' });
    start(async () => {
      try {
        const staged = await stageUpload(f, 'documents');
        const r = await uploadObservationAction(caseId, staged);
        toast(r.ok ? { title: '관찰의견서 파일을 올렸습니다. (기존 파일은 교체됨)' } : { title: r.error, variant: 'destructive' });
        if (r.ok) {
          setPicked(null);
          if (fileRef.current) fileRef.current.value = '';
          router.refresh();
        }
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : '업로드 실패', variant: 'destructive' });
      }
    });
  };

  const uploadOk = editable && uploadGate.ok;
  return (
    <div className="flex flex-col gap-4">
      {file && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <FileText className="h-4 w-4" />
          현재 제출본: <b className="min-w-0 truncate">{file.name}</b>
          <FileActions docId={file.id} name={file.name} className="ml-auto" />
        </div>
      )}
      {!file && !editable && <p className="text-sm text-muted-foreground">아직 제출되지 않았습니다.</p>}
      {editable && (
        <div className={`flex flex-col gap-2 rounded-lg border p-3 ${uploadOk ? 'border-primary/40 bg-primary/5' : 'bg-muted/30'}`}>
          <p className="text-sm font-semibold">관찰의견서 파일 업로드 {file && <span className="text-xs font-normal text-muted-foreground">(다시 올리면 기존 파일과 교체)</span>}</p>
          {!uploadOk && (
            // 잠금 안내 = 바이올렛 배경 + 기본(12px)보다 2pt 크게(15px)
            <p role="note" className="inline-flex items-start gap-1.5 rounded-lg bg-violet-100 px-3 py-2 text-[15px] font-medium leading-snug text-violet-900 dark:bg-violet-950/60 dark:text-violet-100">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" /> {uploadGate.hint}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={fileRef}
              type="file"
              accept=".pdf,.hwp,.hwpx,.doc,.docx"
              className="max-w-xs"
              disabled={pending || !uploadOk}
              onChange={(e) => setPicked(e.target.files?.[0]?.name ?? null)}
            />
            <Button onClick={upload} disabled={pending || !uploadOk || !picked} className="gap-1">
              <Upload className="h-4 w-4" /> {pending ? '올리는 중…' : '파일 업로드'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">PDF · HWP · HWPX · Word 파일</p>
        </div>
      )}
    </div>
  );
}
