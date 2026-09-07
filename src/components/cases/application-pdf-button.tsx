'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';

import { getApplicationSourcePdfUrl } from '@/lib/workflow/case-actions';
import { useFileViewer } from '@/components/common/file-viewer';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * 케이스에 첨부된 사업신청서 원본 PDF 를 팝업 레이어로 연다.
 * 리스트 행(내비게이션 Link) 내부에서도 눌리도록 클릭 이벤트 전파를 막는다.
 */
export function ApplicationPdfButton({
  caseId,
  className,
  label = '신청서 PDF',
}: {
  caseId: string;
  className?: string;
  /** 버튼 텍스트 (기본 '신청서 PDF') */
  label?: string;
}) {
  const { openUrl } = useFileViewer();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function open(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    const url = await getApplicationSourcePdfUrl(caseId);
    setLoading(false);
    if (url) openUrl(url, { title: '사업신청서(원본)' });
    else toast({ title: '첨부된 신청서 PDF가 없습니다.', variant: 'destructive' });
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      title="진흥원이 등록 시 첨부한 사업신청서 원본 PDF 보기"
      className={cn(
        'relative z-10 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60',
        className,
      )}
    >
      <FileText className="h-3 w-3" />
      {loading ? '여는 중…' : label}
    </button>
  );
}
