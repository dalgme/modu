import { notFound } from 'next/navigation';

// PDF 생성(Chromium) 타임아웃 상향
export const maxDuration = 60;

import { requireNextlab } from '@/lib/auth/guards';
import { getCaseById, listMentors } from '@/lib/data/cases';
import { getCaseFormStatus } from '@/lib/data/form-status';
import { listSupplementRequests } from '@/lib/data/supplement-requests';
import { getFeatureFlags } from '@/lib/data/app-settings';
import { StatusBadge } from '@/components/cases/status-badge';
import { CaseDetailCard } from '@/components/cases/case-detail-card';
import { MentorAssignPanel } from '@/components/cases/mentor-assign-panel';
import { MenteeInvitePanel } from '@/components/cases/mentee-invite-panel';
import { BusinessPlanPanel } from '@/components/cases/business-plan-panel';
import { ReviewPanel } from '@/components/cases/review-panel';
import { CaseDeliverablesReview } from '@/components/cases/case-deliverables-review';
import { EditGrantPanel } from '@/components/cases/edit-grant-panel';
import { EditGrantDocsPanel } from '@/components/cases/edit-grant-docs-panel';
import { getActiveEditGrant } from '@/lib/data/edit-grants';
import { PaymentApplicationPanel } from '@/components/cases/payment-application-panel';
import { PaymentFileAttach } from '@/components/cases/payment-file-attach';
import { PaymentFilesPanel } from '@/components/cases/payment-files-panel';
import { DeliverableTabs } from '@/components/cases/deliverable-tabs';
import { listPaymentFiles } from '@/lib/data/payment-files';
import { AttachmentFormsPanel, type FormGroup } from '@/components/cases/attachment-forms-panel';
import { CaseLifecyclePanel } from '@/components/cases/case-lifecycle-panel';
import { SupplementRequestForm } from '@/components/support/supplement-request-form';
import { StaffSupportDocsPanel } from '@/components/support/staff-support-docs-panel';
import { statusStep } from '@/types/case-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils/format';

export default async function Page({ params }: { params: { id: string } }) {
  await requireNextlab();
  const [item, mentors] = await Promise.all([getCaseById(params.id), listMentors()]);
  if (!item) notFound();
  const [formStatus, supplements, paymentFiles, flags] = await Promise.all([
    getCaseFormStatus(item.id),
    listSupplementRequests(item.id),
    listPaymentFiles(item.id),
    getFeatureFlags(),
  ]);
  const formGroups: FormGroup[] = [
    ...(flags.formsSelection ? (['selection'] as const) : []),
    ...(flags.formsChangePayment ? (['change_payment'] as const) : []),
  ];
  // 지원신청 검수 단계 이상: 상단 '멘티 관리(산출물 검수)' 뷰에 이미 정리되어 있으므로
  // 중복되는 개별 패널(멘토링 일지·업체별 사업추진 계획서)은 숨긴다.
  const isReviewStage = statusStep(item.status) >= statusStep('under_review');
  const editGrant = await getActiveEditGrant(item.id);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{item.business_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            대표자 {item.owner_name} · 등록 {formatDate(item.created_at)}
          </p>
        </div>
        <StatusBadge status={item.status} showStep />
      </div>

      <MenteeInvitePanel
        caseId={item.id}
        menteeLinked={!!item.mentee_id}
        defaultName={item.owner_name}
        defaultPhone={item.phone}
        defaultEmail={item.email}
      />
      <MentorAssignPanel
        caseId={item.id}
        mentors={mentors}
        assignable={item.status === 'registered'}
        currentMentorName={item.mentorName}
        currentMentorId={item.mentorId}
        reassignable={
          item.mentorId !== null &&
          item.status !== 'registered' &&
          item.status !== 'withdrawn' &&
          item.status !== 'rejected' &&
          item.status !== 'payment_approved'
        }
      />
      {/* 멘토 '멘티 관리'와 동일한 단계형 산출물 뷰(열람·다운로드 전용) — 검수 편의 */}
      <CaseDeliverablesReview
        caseId={item.id}
        supportTypeCode={item.supportTypeCode}
        status={item.status}
        logViewBase={`/nextlab/cases/${item.id}/log`}
        paymentUpload
        canRegenerateReport
      />
      {item.status === 'under_review' && <ReviewPanel caseId={item.id} />}
      {(item.status === 'reviewed' || editGrant) && (
        <EditGrantPanel
          caseId={item.id}
          active={editGrant ? { target: editGrant.target, expiresAt: editGrant.expiresAt } : null}
        />
      )}
      {editGrant && <EditGrantDocsPanel caseId={item.id} />}
      {item.status === 'execution_docs_submitted' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">지급신청서 작성</CardTitle>
            <p className="text-xs text-muted-foreground">
              멘티가 등록한 시공·지급 증빙을 확인한 뒤, 완성한 지급신청서를 파일로 올리거나 웹에서
              작성합니다. (증빙 등록은 지급신청서 작성 단계에 포함됩니다.)
            </p>
          </CardHeader>
          <CardContent>
            <DeliverableTabs
              attachLabel="지급신청서 파일첨부(업로드)"
              webLabel="웹에서 작성하기"
              attachHint="완성한 지급신청서 파일을 올리면 바로 제출됩니다 (기본)"
              webHint="계좌·금액 입력 + 지급신청서 PDF 생성"
              attach={<PaymentFileAttach caseId={item.id} files={paymentFiles} />}
              web={<PaymentApplicationPanel caseId={item.id} />}
            />
          </CardContent>
        </Card>
      ) : (
        <PaymentFilesPanel caseId={item.id} />
      )}
      <CaseDetailCard item={item} />
      {flags.supplementRequest && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">멘티에게 보완 요청</CardTitle>
            <p className="text-xs text-muted-foreground">
              부족한 서류를 멘티에게 요청합니다. 멘티 대시보드에 표시되고 문자로도 안내됩니다.
            </p>
          </CardHeader>
          <CardContent>
            <SupplementRequestForm caseId={item.id} requests={supplements} />
          </CardContent>
        </Card>
      )}
      <StaffSupportDocsPanel caseId={item.id} />
      {!isReviewStage && <BusinessPlanPanel caseId={item.id} hasPlan={item.hasBusinessPlan} />}
      <AttachmentFormsPanel caseId={item.id} status={formStatus} groups={formGroups} />
      <CaseLifecyclePanel caseId={item.id} status={item.status} showChange={false} />
    </main>
  );
}
