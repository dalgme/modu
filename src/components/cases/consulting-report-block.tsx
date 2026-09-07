'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck2, Upload, FileText, Loader2, Lock } from 'lucide-react';

import { FileActions } from '@/components/cases/file-actions';

import {
  generateConsultingReportAction,
  uploadConsultingReportAction,
} from '@/lib/workflow/consulting-report-actions';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface ConsultingReportItem {
  id: string;
  name: string;
  url: string | null;
  downloadUrl: string | null;
  previewable: boolean;
}

/**
 * 컨설팅 결과보고서 단계 — (1) 웹작성 일지 병합 생성, (2) 완성본 파일 업로드.
 * 화면 이동 없이 생성/업로드하고 팝업으로 알린다. 기존 보고서가 있으면 '교체' 확인 후 대체한다.
 */
export function ConsultingReportBlock({
  caseId,
  enabled,
  gateHint,
  reports,
}: {
  caseId: string;
  enabled: boolean;
  gateHint: string;
  reports: ConsultingReportItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmMode, setConfirmMode] = useState<null | 'generate' | 'upload'>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const hasExisting = reports.length > 0;

  async function doGenerate() {
    const existed = hasExisting;
    setBusy(true);
    const res = await generateConsultingReportAction(caseId);
    setBusy(false);
    if (!res.ok) {
      toast({ title: '생성 실패', description: res.error, variant: 'destructive' });
      return;
    }
    router.refresh();
    setSuccessMsg(
      existed ? '새로운 파일로 교체/저장되었습니다.' : '생성 및 저장이 완료되었습니다.',
    );
  }

  async function doUpload(file: File) {
    const existed = hasExisting;
    setBusy(true);
    try {
      const urlRes = await fetch('/api/support/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name }),
      });
      const urlJson = await urlRes.json();
      if (!urlJson.ok) throw new Error(urlJson.error ?? '업로드 URL 발급 실패');
      const supabase = createBrowserSupabase();
      const { error: upErr } = await supabase.storage
        .from('documents')
        .uploadToSignedUrl(urlJson.path, urlJson.token, file, {
          contentType: file.type || 'application/octet-stream',
        });
      if (upErr) throw new Error(`스토리지 업로드 실패: ${upErr.message}`);
      const res = await uploadConsultingReportAction(caseId, {
        stagingPath: urlJson.path,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      });
      if (!res.ok) throw new Error(res.error);
      router.refresh();
      setSuccessMsg(
        existed ? '새로운 파일로 교체/저장되었습니다.' : '업로드 및 저장이 완료되었습니다.',
      );
    } catch (err) {
      toast({
        title: '업로드 실패',
        description: err instanceof Error ? err.message : '다시 시도하세요.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  const inputId = `consulting-upload-${caseId}`;
  const openFilePicker = () => document.getElementById(inputId)?.click();

  function onGenerateClick() {
    if (hasExisting) setConfirmMode('generate');
    else doGenerate();
  }
  function onUploadClick() {
    if (hasExisting) setConfirmMode('upload');
    else openFilePicker();
  }
  function onConfirmYes() {
    const mode = confirmMode;
    setConfirmMode(null);
    if (mode === 'generate') doGenerate();
    else if (mode === 'upload') openFilePicker();
  }

  if (!enabled) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
        <Lock className="h-4 w-4 shrink-0" />
        {gateHint}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {reports.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{r.name}</span>
              <FileActions
                url={r.url}
                downloadUrl={r.downloadUrl}
                previewable={r.previewable}
                className="ml-auto"
              />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={onGenerateClick}
          disabled={busy}
          className={cn(
            'gap-2',
            hasExisting && 'bg-status-approved text-white hover:bg-status-approved/90',
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
          웹작성 일지로 생성하기
        </Button>
        <input
          id={inputId}
          type="file"
          accept="application/pdf,image/*,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) doUpload(file);
          }}
          disabled={busy}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onUploadClick}
          className={cn(
            'gap-2',
            hasExisting && 'border-status-approved/50 text-status-approved hover:bg-status-approved/10',
          )}
        >
          <Upload className="h-4 w-4" />
          완성본 업로드
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        웹으로 작성한 회차별 일지 + 첨부한 PDF 일지를 하나로 병합하거나, 완성한 보고서 파일을 직접
        올릴 수 있습니다. 화면 이동 없이 저장되며, 결과보고서는 한 개만 유지됩니다.
        <br />
        <span className="text-muted-foreground/80">
          ※ HWP·오피스 문서는 웹 미리보기가 지원되지 않습니다(다운로드로 확인). 화면에서 바로 보이는
          보고서가 필요하면 <b className="text-foreground">‘웹작성 일지로 생성하기’</b>(PDF) 를
          이용하거나 <b className="text-foreground">PDF</b> 로 올려 주세요.
        </span>
      </p>

      {/* 교체 확인 팝업 */}
      <Dialog open={confirmMode !== null} onOpenChange={(o) => !o && setConfirmMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기존 결과보고서 교체</DialogTitle>
            <DialogDescription>
              기존 결과보고서를 삭제하고 새로운 보고서를 생성/교체(업로드)할까요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmMode(null)}>
              아니오
            </Button>
            <Button type="button" onClick={onConfirmYes}>
              네
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 완료 알림 팝업 */}
      <Dialog open={successMsg !== null} onOpenChange={(o) => !o && setSuccessMsg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>완료</DialogTitle>
            <DialogDescription>{successMsg}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setSuccessMsg(null)}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
