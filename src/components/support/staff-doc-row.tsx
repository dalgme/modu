'use client';

import { useState } from 'react';
import { FileText, Eye, Download } from 'lucide-react';

import {
  getSupportDocUrl,
  getContractorSignatureUrl,
} from '@/lib/workflow/support-items-actions';
import { useFileViewer } from '@/components/common/file-viewer';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * 운영진(진흥원·넥스트랩)용 제출 서류 1건 행 — 보기(팝업) + 다운로드.
 * kind='signature' 면 공사업체 서명(signatures 버킷), 그 외는 documents 버킷.
 */
export function StaffDocRow({
  caseId,
  docId,
  docName,
  kind = 'doc',
}: {
  caseId: string;
  docId: string;
  docName: string;
  kind?: 'doc' | 'signature';
}) {
  const { openUrl } = useFileViewer();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function fetchUrl(download: boolean): Promise<string | null> {
    return kind === 'signature'
      ? getContractorSignatureUrl(caseId, docId, download)
      : getSupportDocUrl(caseId, docId, download);
  }

  async function onView() {
    setBusy(true);
    const url = await fetchUrl(false);
    setBusy(false);
    if (url) openUrl(url, { title: docName });
    else toast({ title: '파일을 열 수 없습니다.', variant: 'destructive' });
  }

  async function onDownload() {
    setBusy(true);
    const url = await fetchUrl(true);
    setBusy(false);
    if (!url) {
      toast({ title: '다운로드할 수 없습니다.', variant: 'destructive' });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-sm">
      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">{docName}</span>
      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" disabled={busy} onClick={onView}>
        <Eye className="h-3.5 w-3.5" />
        보기
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" disabled={busy} onClick={onDownload}>
        <Download className="h-3.5 w-3.5" />
        다운로드
      </Button>
    </div>
  );
}
