import { Check, Circle } from 'lucide-react';

import type { SupportTypeDocument } from '@/lib/data/support-types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

function DocRow({ doc, uploaded }: { doc: SupportTypeDocument; uploaded: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-md border p-3">
      {uploaded ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-approved" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn('text-sm', uploaded && 'text-muted-foreground line-through')}>
            {doc.doc_name}
          </span>
          {doc.attachment_no && (
            <Badge variant="secondary" className="text-[10px]">
              {doc.attachment_no}
            </Badge>
          )}
          {uploaded && <span className="text-xs text-status-approved">제출됨</span>}
        </div>
        {doc.condition && <p className="text-xs text-muted-foreground">· {doc.condition}</p>}
      </div>
    </li>
  );
}

/**
 * 멘티 맞춤 구비서류 안내.
 * 멘티가 신청한 지원유형(support_type)에 매핑된 서류만 노출하고,
 * 필수/해당시(조건부)로 나눠 조건 설명과 제출 여부를 함께 보여준다.
 */
export function MenteeChecklist({
  supportTypeName,
  documents,
  counts,
}: {
  supportTypeName: string;
  documents: SupportTypeDocument[];
  counts: Record<string, number>;
}) {
  const required = documents.filter((d) => d.is_required);
  const conditional = documents.filter((d) => !d.is_required);
  const uploaded = (d: SupportTypeDocument) => (counts[d.doc_key] ?? 0) > 0;
  const doneCount = required.filter(uploaded).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          신청 유형 <span className="font-medium text-foreground">{supportTypeName}</span> 기준
          맞춤 구비서류입니다.
        </p>
        <span className="text-sm">
          필수 제출{' '}
          <span className="font-semibold tabular-nums">
            {doneCount}/{required.length}
          </span>
        </span>
      </div>

      {required.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">필수 서류</h3>
          <ul className="flex flex-col gap-2">
            {required.map((d) => (
              <DocRow key={d.id} doc={d} uploaded={uploaded(d)} />
            ))}
          </ul>
        </div>
      )}

      {conditional.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">해당 시 준비 (신청내용에 따라)</h3>
          <ul className="flex flex-col gap-2">
            {conditional.map((d) => (
              <DocRow key={d.id} doc={d} uploaded={uploaded(d)} />
            ))}
          </ul>
        </div>
      )}

      {documents.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          등록된 구비서류 안내가 없습니다. 운영팀에 문의해 주세요.
        </div>
      )}
    </div>
  );
}
