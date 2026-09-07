'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Upload, Trash2, Check, Loader2, AlertCircle } from 'lucide-react';

import { attachCaseDocAction, deleteCaseDocAction } from '@/lib/workflow/mentor-doc-actions';
import {
  attachPaymentDocAction,
  deletePaymentDocAction,
} from '@/lib/workflow/payment-docs-actions';
import type { CaseDocFile } from '@/lib/data/case-docs';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { FileActions } from '@/components/cases/file-actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * 케이스 서류(허용 doc_key) 업로드/열람/삭제 공용 위젯.
 * 멘티 사업자등록증, 공사업체 견적서/비교견적서/공급업체 사업자등록증 등에 재사용.
 */
export function CaseDocUpload({
  caseId,
  docKey,
  label,
  files,
  required = false,
  multiple = true,
  hint,
  accent = false,
  uploadLabel,
  kind = 'case',
}: {
  caseId: string;
  docKey: string;
  label: string;
  files: CaseDocFile[];
  required?: boolean;
  multiple?: boolean;
  hint?: string;
  /** 업로드 버튼을 강조색(파란 primary)으로 표시 */
  accent?: boolean;
  /** 업로드 버튼 문구 커스텀(미첨부 상태에서 사용) */
  uploadLabel?: string;
  /**
   * 서버 액션 라우팅.
   * - 'case'(기본): 멘토/넥스트랩(임시 수정권한) 편집 액션
   * - 'payment': 지급신청서 서류(멘토·멘티·넥스트랩) 액션
   */
  kind?: 'case' | 'payment';
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const done = files.length > 0;
  const attachAction = kind === 'payment' ? attachPaymentDocAction : attachCaseDocAction;
  const deleteAction = kind === 'payment' ? deletePaymentDocAction : deleteCaseDocAction;

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
      const res = await attachAction(caseId, docKey, label, {
        stagingPath: urlJson.path,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      });
      if (!res.ok) throw new Error(res.error);
      toast({ title: `${label} 첨부 완료` });
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
    const res = await deleteAction(caseId, docId);
    setBusy(false);
    if (res.ok) {
      toast({ title: '삭제되었습니다.' });
      router.refresh();
    } else {
      toast({ title: '삭제 실패', description: res.error, variant: 'destructive' });
    }
  }

  const inputId = `case-doc-${docKey}-${caseId}`;
  const canAdd = multiple || files.length === 0;

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        required && !done && 'border-status-rejected/40 bg-status-rejected/5',
        done && 'border-status-approved/30',
      )}
    >
      <div className="flex items-center gap-2">
        {done ? (
          <Check className="h-4 w-4 shrink-0 text-status-approved" />
        ) : required ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-status-rejected" />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{label}</span>
        {required && (
          <span className="rounded bg-status-rejected/10 px-1.5 py-0.5 text-[10px] font-semibold text-status-rejected">
            필수
          </span>
        )}
      </div>
      {hint && <p className="mt-1 pl-6 text-xs text-muted-foreground">{hint}</p>}

      {files.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5 pl-6">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{f.name}</span>
              <FileActions
                url={f.url}
                downloadUrl={f.downloadUrl}
                previewable={f.previewable}
                className="ml-auto"
              />
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

      {canAdd && (
        <div className="mt-2 pl-6">
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
            variant={done || accent ? 'default' : 'outline'}
            size="sm"
            disabled={busy}
            onClick={() => document.getElementById(inputId)?.click()}
            className={cn(
              'gap-2',
              done
                ? 'bg-status-approved text-white hover:bg-status-approved/90'
                : accent
                  ? 'bg-status-progress text-white hover:bg-status-progress/90'
                  : '',
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {done ? '파일 추가' : (uploadLabel ?? '파일 올리기')}
          </Button>
        </div>
      )}
    </div>
  );
}
