'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * 진흥원: 지원신청 서류(컨설팅 결과보고서·지원신청서·멘티 사업자등록증·공사업체 서류)를
 * ZIP 한 개로 일괄 다운로드. 서버 라우트가 서류를 모아 zip 으로 스트리밍한다.
 */
export function ApplicationBundleDownload({
  caseId,
  businessName,
}: {
  caseId: string;
  businessName: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/institution/cases/${caseId}/application-docs`);
      if (!res.ok) {
        const msg =
          res.status === 404
            ? '첨부된 지원신청 서류가 없습니다.'
            : '다운로드에 실패했습니다. 잠시 후 다시 시도하세요.';
        toast({ title: '다운로드 실패', description: msg, variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${businessName}_지원신청서류.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: '다운로드 실패', description: '네트워크 오류입니다.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" onClick={download} disabled={busy} className="gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      지원신청 서류 일괄 다운로드(ZIP)
    </Button>
  );
}
