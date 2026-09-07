'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Camera, Trash2, Check } from 'lucide-react';

import {
  attachSupportDocAction,
  deleteSupportDocAction,
  getSupportDocUrl,
} from '@/lib/workflow/support-items-actions';
import type { SupportDocFile } from '@/lib/data/support-items';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { useFileViewer } from '@/components/common/file-viewer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface DocUploadRowProps {
  caseId: string;
  docKey: string;
  docName: string;
  hint?: string;
  required?: boolean;
  multiple?: boolean;
  editable: boolean;
  docs: SupportDocFile[];
}

/**
 * 서류 1항목의 업로드/열람/삭제 행. 브라우저 → 스토리지 직접 업로드(본문 한도 우회).
 * 여러 장 허용(multiple)이면 계속 추가할 수 있고, 아니면 1장만.
 */
export function DocUploadRow({
  caseId,
  docKey,
  docName,
  hint,
  required,
  multiple,
  editable,
  docs,
}: DocUploadRowProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { openUrl } = useFileViewer();
  const [busy, setBusy] = useState(false);

  const inputId = `up-${docKey}`;
  const canAddMore = editable && (multiple || docs.length === 0);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
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

      const res = await attachSupportDocAction(caseId, docKey, docName, {
        stagingPath: urlJson.path,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      });
      if (!res.ok) throw new Error(res.error);
      toast({ title: `${docName} 첨부 완료` });
      router.refresh();
    } catch (err) {
      toast({
        title: '첨부 실패',
        description: err instanceof Error ? err.message : '다시 시도하세요.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  }

  async function onView(docId: string) {
    const url = await getSupportDocUrl(caseId, docId);
    if (url) openUrl(url, { title: docName });
    else toast({ title: '파일을 열 수 없습니다.', variant: 'destructive' });
  }

  async function onDelete(docId: string) {
    setBusy(true);
    const res = await deleteSupportDocAction(caseId, docId);
    setBusy(false);
    if (res.ok) {
      toast({ title: '삭제되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '삭제 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{docName}</span>
        {required && <Badge variant="secondary">필수</Badge>}
        {multiple && <span className="text-[11px] text-muted-foreground">여러 장 가능</span>}
        {docs.length > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-status-approved/10 px-2 py-0.5 text-xs font-semibold text-status-approved">
            <Check className="h-3 w-3" />
            {docs.length}개 올림
          </span>
        ) : (
          <span className="ml-auto text-xs font-medium text-muted-foreground">아직 안 올렸어요</span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {docs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {docs.map((d, i) => (
            <li
              key={d.id}
              className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
              <button
                type="button"
                onClick={() => onView(d.id)}
                className="truncate text-left text-primary hover:underline"
              >
                {d.docName || `첨부 ${i + 1}`}
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => onDelete(d.id)}
                  disabled={busy}
                  aria-label="삭제"
                  className="ml-auto rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAddMore && (
        <div className="flex flex-col gap-1.5">
          <input
            id={inputId}
            type="file"
            accept="application/pdf,image/*,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            className="hidden"
            onChange={onFile}
            disabled={busy}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => document.getElementById(inputId)?.click()}
            className="gap-2 border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
          >
            <Camera className="h-4 w-4" />
            {busy
              ? '올리는 중…'
              : docs.length > 0 && multiple
                ? '사진·파일 더 올리기'
                : '사진·파일 올리기'}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            휴대폰으로 촬영하거나 앨범·파일에서 선택할 수 있어요. (사진·PDF 가능)
          </p>
        </div>
      )}
    </div>
  );
}
