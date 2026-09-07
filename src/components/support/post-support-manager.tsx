'use client';

import type { SupportDocFile } from '@/lib/data/support-items';
import { POST_DOCS, postDocKey } from '@/lib/support/catalog';
import { DocUploadRow } from '@/components/support/doc-upload-row';
import { Card, CardContent } from '@/components/ui/card';

/**
 * 자금신청(사후) 관리 — 지급 증빙 서류 업로드 (세금계산서·거래명세서·이체확인서·시공 사진).
 * 멘티 본인 또는 담당 멘토(대리)가 편집.
 */
export function PostSupportManager({
  caseId,
  docs,
  editable,
}: {
  caseId: string;
  docs: SupportDocFile[];
  editable: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 text-sm text-muted-foreground">
          공사·설비 완료 후 <b className="text-foreground">대금 지급 증빙</b>을 올립니다. 세금계산서·
          거래명세서·이체확인서와 함께 <b className="text-foreground">시공 전/후 사진</b>을 첨부하면
          정산이 빨라집니다.
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {POST_DOCS.map((spec) => (
          <DocUploadRow
            key={spec.docType}
            caseId={caseId}
            docKey={postDocKey(spec.docType)}
            docName={spec.name}
            hint={spec.hint}
            multiple={spec.multiple}
            editable={editable}
            docs={docs.filter((d) => d.docType === spec.docType)}
          />
        ))}
      </div>
    </div>
  );
}
