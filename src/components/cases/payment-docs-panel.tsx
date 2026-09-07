import { PaymentDocSteps } from '@/components/cases/payment-doc-steps';

/**
 * 폐업 정리 지원금신청서 + 첨부서류 패널 (멘티 '자금신청(사후)' 화면 등 단독 노출용).
 * '경영지원' 프로세스와 동일한 StepShell 레이아웃(1. 지원금신청서 / 2. 지급 증빙서류)을 승계한다.
 *  - 기본(업로드): 멘토·멘티기업·넥스트랩 (payment-docs-actions 권한 확인)
 *  - readOnly: 열람 전용
 */
export async function PaymentDocsPanel({
  caseId,
  readOnly = false,
}: {
  caseId: string;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">지원금신청서 · 첨부서류</h2>
        <span className="text-xs text-muted-foreground">
          {readOnly ? '열람·다운로드 전용' : '멘토·멘티기업·넥스트랩 업로드'}
        </span>
      </div>
      <PaymentDocSteps caseId={caseId} startN={1} editable={!readOnly} />
    </div>
  );
}
