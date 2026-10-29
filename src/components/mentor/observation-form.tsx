'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Lock, Pencil, Trash2, Upload } from 'lucide-react';

import type { ObservationHistoryItem } from '@/lib/data/rounds';
import { deleteObservationAction, uploadObservationAction } from '@/lib/workflow/mentor-actions';
import { stageUpload } from '@/lib/storage/browser-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { FileActions } from '@/components/files/file-preview';
import { ObservationFileLog } from '@/components/files/observation-file-log';

/**
 * 관찰의견서 — **파일 업로드만** (2026-09-30: 웹 작성 폐지, observation_reports 는 임시 필드로 보존).
 *  - 첫 업로드는 계획 회차 보고서를 모두 올린 뒤에만 열린다 — `uploadGate` = 서버(uploadObservationFile)와 같은 observationUploadGate 결과.
 *  - 올린 뒤에는 [수정 업로드](교체, 최초 업로드일 유지)·[삭제] 가능 — `editable` = 서버 게이트 observationEditable(status) 와 같은 조건
 *    (멘토 배정·진행 중·보완 요청. 종결 요청 후 검수 중에는 잠김).
 *  - 저장 파일명·최초 업로드·최근 수정 + 변경 이력(감사 로그)을 바이올렛 줄로 보여 준다.
 */
export function ObservationForm({
  caseId,
  file,
  history = [],
  editable,
  uploadGate = { ok: true, hint: '' },
}: {
  caseId: string;
  file: { id: string; name: string; createdAt: string; updatedAt: string } | null;
  history?: ObservationHistoryItem[];
  editable: boolean;
  uploadGate?: { ok: boolean; hint: string };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const upload = () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return toast({ title: '파일을 선택하세요.', variant: 'destructive' });
    start(async () => {
      try {
        const staged = await stageUpload(f, 'documents');
        const r = await uploadObservationAction(caseId, staged);
        toast(r.ok ? { title: file ? '관찰의견서를 새 파일로 교체했습니다.' : '관찰의견서 파일을 올렸습니다.' } : { title: r.error, variant: 'destructive' });
        if (r.ok) {
          setPicked(null);
          setReplacing(false);
          if (fileRef.current) fileRef.current.value = '';
          router.refresh();
        }
      } catch (err) {
        toast({ title: err instanceof Error ? err.message : '업로드 실패', variant: 'destructive' });
      }
    });
  };

  const remove = async () => {
    if (!file) return;
    const ok = await confirm({
      title: '관찰의견서 파일을 삭제할까요?',
      severity: 'danger',
      impact: [`삭제 파일: ${file.name}`, '삭제 후에는 새 파일을 다시 올려야 종결 요청을 할 수 있습니다.', '삭제 기록은 변경 이력에 남습니다.'],
      confirmLabel: '삭제',
    });
    if (!ok) return;
    start(async () => {
      const r = await deleteObservationAction(caseId);
      toast(r.ok ? { title: '관찰의견서 파일을 삭제했습니다.' } : { title: r.error, variant: 'destructive' });
      if (r.ok) router.refresh();
    });
  };

  const uploadOk = editable && uploadGate.ok;
  const showUploader = editable && (!file || replacing);
  return (
    <div className="flex flex-col gap-4">
      {dialog}
      {file && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="text-muted-foreground">현재 제출본</span>
            <b className="min-w-0 truncate">{file.name}</b>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <FileActions docId={file.id} name={file.name} />
              {editable && (
                <>
                  <Button size="sm" variant="outline" className="h-8 gap-1" disabled={pending} onClick={() => setReplacing((v) => !v)}>
                    <Pencil className="h-3.5 w-3.5" /> {replacing ? '수정 취소' : '수정 업로드'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300" disabled={pending} onClick={remove}>
                    <Trash2 className="h-3.5 w-3.5" /> 삭제
                  </Button>
                </>
              )}
            </div>
          </div>
          <ObservationFileLog fileName={file.name} createdAt={file.createdAt} updatedAt={file.updatedAt} history={history} />
          {!editable && <p className="text-xs text-muted-foreground">종결 요청 후(검수 중)에는 수정·삭제할 수 없습니다. 보완 요청을 받으면 다시 열립니다.</p>}
        </div>
      )}
      {!file && history.length > 0 && <ObservationFileLog fileName={null} createdAt={null} updatedAt={null} history={history} />}
      {!file && !editable && <p className="text-sm text-muted-foreground">아직 제출되지 않았습니다.</p>}
      {showUploader && (
        <div className={`flex flex-col gap-2 rounded-lg border p-3 ${uploadOk ? 'border-primary/40 bg-primary/5' : 'bg-muted/30'}`}>
          <p className="text-sm font-semibold">
            {file ? '관찰의견서 수정 업로드' : '관찰의견서 파일 업로드'}
            {file && <span className="ml-1 text-xs font-normal text-muted-foreground">(새 파일로 교체 — 최초 업로드일은 유지되고 수정일이 기록됩니다)</span>}
          </p>
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
              <Upload className="h-4 w-4" /> {pending ? '올리는 중…' : file ? '교체 업로드' : '파일 업로드'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">PDF · HWP · HWPX · Word 파일</p>
        </div>
      )}
    </div>
  );
}
