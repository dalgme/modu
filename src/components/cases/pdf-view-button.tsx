'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';

import { getApplicationPdfUrl } from '@/lib/workflow/application-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFileViewer } from '@/components/common/file-viewer';

/** 생성된 신청서 PDF 를 팝업 레이어로 미리본다 */
export function PdfViewButton({ caseId }: { caseId: string }) {
  const { toast } = useToast();
  const { openUrl } = useFileViewer();
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    const url = await getApplicationPdfUrl(caseId);
    setLoading(false);
    if (url) openUrl(url, { title: '지원신청서(생성)' });
    else toast({ title: '생성된 PDF가 없습니다.', variant: 'destructive' });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={open} disabled={loading}>
      <FileText className="h-4 w-4" />
      신청서 PDF 미리보기
    </Button>
  );
}
