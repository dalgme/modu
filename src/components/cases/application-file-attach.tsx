'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Upload, Trash2, Check, Loader2 } from 'lucide-react';

import {
  attachApplicationFileAction,
  deleteApplicationFileAction,
} from '@/lib/workflow/application-attach-actions';
import type { AttachedFile } from '@/lib/data/application-files';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils/format';

/**
 * 지원신청서 '완성본 파일 첨부'(기본 방식).
 * 브라우저 → documents 버킷 직접 업로드 후 경로만 서버로 전달.
 * 첨부만으로도 진행단계가 application_drafted 로 전진한다.
 */
export function ApplicationFileAttach({
  caseId,
  files,
}: {
  caseId: string;
  files: AttachedFile[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

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

      const res = await attachApplicationFileAction(caseId, {
        stagingPath: urlJson.path,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      });
      if (!res.ok) throw new Error(res.error);
      toast({ title: '지원신청서를 첨부했습니다.' });
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

  async function onDelete(docId: string) {
    setBusy(true);
    const res = await deleteApplicationFileAction(caseId, docId);
    setBusy(false);
    if (res.ok) {
      toast({ title: '삭제되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '삭제 실패', description: res.error, variant: 'destructive' });
    }
  }

  const inputId = `application-file-${caseId}`;

  return (
    <div className="flex flex-col gap-3">
      {files.length > 0 ? (
        <div className="flex items-center gap-1.5 rounded-md border border-status-approved/40 bg-status-approved/10 px-3 py-2 text-sm font-medium text-status-approved">
          <Check className="h-4 w-4" />
          완성본 {files.length}개 첨부됨 — 진행단계 &lsquo;지원신청서 작성 완료&rsquo;로 반영됩니다.
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          완성한 지원신청서(붙임서식 포함)를 파일로 올리면 웹 작성 없이 바로 제출됩니다. 제출 시
          넥스트랩 검수 요청이 발송됩니다. (PDF·이미지·문서)
        </p>
      )}

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              {f.url ? (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {f.name}
                </a>
              ) : (
                <span className="truncate">{f.name}</span>
              )}
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {formatDateTime(f.createdAt)}
              </span>
              <button
                type="button"
                onClick={() => onDelete(f.id)}
                disabled={busy}
                aria-label="삭제"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
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
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? '올리는 중…' : files.length > 0 ? '신청서 파일 더 올리기' : '신청서 파일 올리기'}
        </Button>
      </div>
    </div>
  );
}
