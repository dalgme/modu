'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Loader2 } from 'lucide-react';

import { regenerateConsultingReportAction } from '@/lib/workflow/consulting-report-actions';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

/**
 * 넥스트랩 검수 화면: 컨설팅 결과보고서를 전체 회차 병합본으로 재생성.
 *
 * 2026-08-14 이전 생성분은 마지막 1회차만 담겨 있어, 검수 중 발견하면 이 자리에서 교체한다.
 * 기존 보고서는 자동으로 교체(삭제 후 재등록)된다.
 */
export function ConsultingReportRegenerateButton({
  caseId,
  uploadedReportNames = [],
}: {
  caseId: string;
  /** 멘토가 직접 올린 완성본 파일명 — 있으면 삭제 경고를 강하게 띄운다 */
  uploadedReportNames?: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    const base =
      '멘토링 일지 전체 회차를 병합해 컨설팅 결과보고서를 다시 만듭니다.\n' +
      '※ 멘토링 일지·업로드한 회차 보고서·현장사진 원본은 변경되지 않습니다.\n';
    const warn =
      uploadedReportNames.length > 0
        ? `\n[주의] 현재 보고서는 멘토가 직접 올린 파일입니다.\n   ${uploadedReportNames.join('\n   ')}\n   재생성하면 이 파일은 삭제되며 되돌릴 수 없습니다.\n`
        : '\n기존 컨설팅 결과보고서는 새 병합본으로 교체됩니다.\n';
    if (!window.confirm(`${base}${warn}\n진행할까요?`)) {
      return;
    }
    setBusy(true);
    const res = await regenerateConsultingReportAction(caseId);
    setBusy(false);
    if (res.ok) {
      toast({
        title: '컨설팅 결과보고서를 다시 생성했습니다.',
        description: '전체 회차가 병합된 최신본으로 교체되었습니다.',
      });
      router.refresh();
    } else {
      toast({ title: '재생성 실패', description: res.error, variant: 'destructive' });
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={busy} className="gap-1.5">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {busy ? '재생성 중…' : '전체 회차로 재생성'}
    </Button>
  );
}
