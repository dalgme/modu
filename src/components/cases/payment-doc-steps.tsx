import { FileText } from 'lucide-react';

import { listCaseDocsByKeys, type CaseDocFile } from '@/lib/data/case-docs';
import {
  PAYMENT_DOC_KEYS,
  PAYMENT_APPLICATION_SLOTS,
  PAYMENT_EVIDENCE_SLOTS,
  type PaymentDocKey,
  type PaymentDocSlot,
} from '@/lib/workflow/payment-doc-keys';
import { CaseDocUpload } from '@/components/cases/case-doc-upload';
import { FileActions } from '@/components/cases/file-actions';
import { StepShell, type StepState } from '@/components/cases/step-shell';

const rowCls = 'flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm';

function FileRow({ file }: { file: CaseDocFile }) {
  return (
    <div className={rowCls}>
      <FileText className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate">{file.name}</span>
      <FileActions
        url={file.url}
        downloadUrl={file.downloadUrl}
        previewable={file.previewable}
        className="ml-auto"
      />
    </div>
  );
}

/**
 * 폐업 지원금신청서 프로세스의 두 단계(지원금신청서 · 지급 증빙서류)를 '경영지원' 프로세스와
 * 동일한 StepShell 레이아웃으로 렌더한다. 멘토 작업 뷰(업로드)와 검수 뷰(열람 전용)에서 공용.
 *  - editable=true  → CaseDocUpload(멘토·멘티기업·넥스트랩 업로드)
 *  - editable=false → 파일 목록(열람·다운로드 전용)
 */
export async function PaymentDocSteps({
  caseId,
  startN = 3,
  editable,
}: {
  caseId: string;
  /** 첫 단계(지원금신청서) 번호. 이어지는 지급 증빙서류는 +1. */
  startN?: number;
  editable: boolean;
}) {
  const byKey = await listCaseDocsByKeys(caseId, [...PAYMENT_DOC_KEYS]);
  const filesOf = (key: PaymentDocKey) => byKey.get(key) ?? [];
  const stepState = (slots: PaymentDocSlot[]): StepState =>
    slots.every((s) => filesOf(s.key).length > 0) ? 'done' : 'active';

  const renderSlots = (slots: PaymentDocSlot[]) => (
    <div className="flex flex-col gap-2.5">
      {slots.map((slot) => {
        const files = filesOf(slot.key);
        if (editable) {
          return (
            <CaseDocUpload
              key={slot.key}
              kind="payment"
              caseId={caseId}
              docKey={slot.key}
              label={slot.label}
              hint={slot.hint}
              multiple={slot.multiple ?? true}
              files={files}
            />
          );
        }
        return (
          <div key={slot.key} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground">{slot.label}</p>
            {files.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                미첨부
              </div>
            ) : (
              files.map((f) => <FileRow key={f.id} file={f} />)
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <StepShell
        n={startN}
        title="지원금신청서"
        state={stepState(PAYMENT_APPLICATION_SLOTS)}
        subtitle="완성한 지원금(지급)신청서와 확약서를 올립니다."
      >
        {renderSlots(PAYMENT_APPLICATION_SLOTS)}
      </StepShell>
      <StepShell
        n={startN + 1}
        title="지급 증빙서류"
        state={stepState(PAYMENT_EVIDENCE_SLOTS)}
        subtitle="공사·지급 관련 증빙을 각각 올립니다."
      >
        {renderSlots(PAYMENT_EVIDENCE_SLOTS)}
      </StepShell>
    </>
  );
}
