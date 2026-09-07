import { FileText, Paperclip } from 'lucide-react';

import { listPaymentFiles } from '@/lib/data/payment-files';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';

/**
 * 넥스트랩이 '파일 첨부' 방식으로 제출한 지급신청서 완성본 (doc_key=payment_application_file).
 * 첨부본이 있을 때만 노출. 진흥원 지급승인 화면에서 생성 PDF 대신 첨부본을 확인.
 */
export async function PaymentFilesPanel({ caseId }: { caseId: string }) {
  const files = await listPaymentFiles(caseId);
  if (files.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Paperclip className="h-3.5 w-3.5" />
          </span>
          지급신청서 첨부본 ({files.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          넥스트랩이 웹 작성 대신 파일로 제출한 지급신청서 완성본입니다.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
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
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
