import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FilePenLine } from 'lucide-react';

// PDF 생성(Chromium) 타임아웃 상향
export const maxDuration = 60;

import { requireInstitution } from '@/lib/auth/guards';
import { getCaseById } from '@/lib/data/cases';
import { getCaseFormStatus } from '@/lib/data/form-status';
import { getFeatureFlags } from '@/lib/data/app-settings';
import { statusStep } from '@/types/case-status';
import { ApplicationBundleDownload } from '@/components/institution/application-bundle-download';
import { CaseDeliverablesReview } from '@/components/cases/case-deliverables-review';
import { EditGrantBadge } from '@/components/cases/edit-grant-badge';
import { getActiveEditGrant } from '@/lib/data/edit-grants';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/cases/status-badge';
import { CaseDetailCard } from '@/components/cases/case-detail-card';
import { OperatorRequestButton } from '@/components/cases/operator-request-button';
import { CaseDetailBackNav } from '@/components/cases/case-detail-back-nav';
import { ApprovalPanel } from '@/components/cases/approval-panel';
import { PaymentApprovalPanel } from '@/components/cases/payment-approval-panel';
import { AttachmentFormsPanel, type FormGroup } from '@/components/cases/attachment-forms-panel';
import { CaseLifecyclePanel } from '@/components/cases/case-lifecycle-panel';
import { StaffSupportDocsPanel } from '@/components/support/staff-support-docs-panel';
import { PaymentFilesPanel } from '@/components/cases/payment-files-panel';
import { formatDate } from '@/lib/utils/format';

export default async function Page({ params }: { params: { id: string } }) {
  await requireInstitution();
  const item = await getCaseById(params.id);
  if (!item) notFound();
  const [formStatus, flags] = await Promise.all([getCaseFormStatus(item.id), getFeatureFlags()]);
  const formGroups: FormGroup[] = [
    ...(flags.formsSelection ? (['selection'] as const) : []),
    ...(flags.formsChangePayment ? (['change_payment'] as const) : []),
  ];
  // 검수/승인 단계 이상: 상단 '멘티 관리(산출물 검수)' 뷰에 정리되어 중복되는 개별 패널은 숨김
  const isReviewStage = statusStep(item.status) >= statusStep('under_review');
  const editGrant = await getActiveEditGrant(item.id);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{item.business_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            대표자 {item.owner_name} · 담당 멘토 {item.mentorName ?? '미배정'} · 등록{' '}
            {formatDate(item.created_at)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={item.status} showStep />
          {editGrant && <EditGrantBadge />}
        </div>
      </div>
      {item.status === 'registered' && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm">
              <b className="text-amber-800 dark:text-amber-300">대상자 등록 단계</b>입니다. 신청서
              PDF를 재업로드하거나 내용을 수정해 다시 등록(멘토 배정 요청)할 수 있습니다.
            </p>
            <Button asChild className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700">
              <Link href={`/institution/cases/${item.id}/edit`}>
                <FilePenLine className="h-4 w-4" />
                재등록 · 내용 수정
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {/* 멘토 '멘티 관리'와 동일한 단계형 산출물 뷰(열람·다운로드 전용) — 검수 편의 */}
      <CaseDeliverablesReview
        caseId={item.id}
        supportTypeCode={item.supportTypeCode}
        status={item.status}
        logViewBase={`/institution/cases/${item.id}/log`}
      />
      {isReviewStage && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              지원신청 서류(컨설팅 결과보고서 · 지원신청서 · 멘티기업 사업자등록증 · 공사업체 서류)를 한
              번에 내려받습니다.
            </p>
            <ApplicationBundleDownload caseId={item.id} businessName={item.business_name} />
          </CardContent>
        </Card>
      )}
      {item.status === 'reviewed' && <ApprovalPanel caseId={item.id} />}
      <PaymentFilesPanel caseId={item.id} />
      {item.status === 'payment_application_drafted' && <PaymentApprovalPanel caseId={item.id} />}
      <CaseDetailCard
        item={item}
        action={
          <OperatorRequestButton
            caseId={item.id}
            businessName={item.business_name}
            ownerName={item.owner_name}
            phone={item.phone}
          />
        }
      />
      <CaseDetailBackNav dashboardHref="/institution/dashboard" />
      <StaffSupportDocsPanel caseId={item.id} />
      <AttachmentFormsPanel caseId={item.id} status={formStatus} groups={formGroups} />
      <CaseLifecyclePanel caseId={item.id} status={item.status} />
    </main>
  );
}
