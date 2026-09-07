import { ListChecks, Route, Bell } from 'lucide-react';

import type { CaseListItem } from '@/lib/data/cases';
import { getCaseFormStatus } from '@/lib/data/form-status';
import { listSupplementRequests } from '@/lib/data/supplement-requests';
import { getFeatureFlags } from '@/lib/data/app-settings';
import { createClient } from '@/lib/supabase/server';
import { SupplementRequestForm } from '@/components/support/supplement-request-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/cases/status-badge';
import { ProcessStepBar } from '@/components/cases/process-step-bar';
import { MentorElapsedCard } from '@/components/cases/mentor-elapsed-card';
import { MentorWorkflow } from '@/components/cases/mentor-workflow';
import { EditGrantDocsPanel } from '@/components/cases/edit-grant-docs-panel';
import { EditGrantBadge } from '@/components/cases/edit-grant-badge';
import { getActiveEditGrant } from '@/lib/data/edit-grants';
import { MentorMenteePanel } from '@/components/cases/mentor-mentee-panel';
import { ApplicationPdfButton } from '@/components/cases/application-pdf-button';
import { CaseDetailCard } from '@/components/cases/case-detail-card';
import { AttachmentFormsPanel, type FormGroup } from '@/components/cases/attachment-forms-panel';
import { ACCENT_BADGE, ACCENT_CARD, ACCENT_TITLE } from '@/components/cases/section-accent';
import { formatDate } from '@/lib/utils/format';

/**
 * 멘토 케이스 상세 본문. 실제 멘토 페이지(/mentor/cases/[id])와 넥스트랩 회원 열람(view-as)에서
 * 공용으로 렌더해 두 화면이 완전히 동일하게 보이도록 한다. (필요 데이터는 자체 조회)
 *
 * 화면 순서: 헤더 → 진행 단계 네비 → 신청 정보 → 멘토 작업 → 멘티 미팅 지원 → 붙임서식
 * (멘토가 케이스를 열면 먼저 업체 정보와 현재 단계를 파악한 뒤 작업하도록 정보를 상단 배치)
 */
export async function MentorCaseDetailBody({ item }: { item: CaseListItem }) {
  const formStatus = await getCaseFormStatus(item.id);
  const editGrant = await getActiveEditGrant(item.id);

  const supabase = createClient();
  const [{ data: mentee }, { count: menteeSigCount }] = await Promise.all([
    item.mentee_id
      ? supabase.from('users').select('name, phone').eq('id', item.mentee_id).maybeSingle()
      : Promise.resolve({ data: null as { name: string; phone: string | null } | null }),
    supabase
      .from('signatures')
      .select('id', { count: 'exact', head: true })
      .eq('case_id', item.id)
      .eq('signer_type', 'mentee'),
  ]);
  const flags = await getFeatureFlags();
  const formGroups: FormGroup[] = [
    ...(flags.formsSelection ? (['selection'] as const) : []),
    ...(flags.formsChangePayment ? (['change_payment'] as const) : []),
  ];
  const supplements = flags.supplementRequest ? await listSupplementRequests(item.id) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{item.business_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            대표자 {item.owner_name} · 등록 {formatDate(item.created_at)}
          </p>
          {item.hasApplicationPdf && (
            <div className="mt-2">
              <ApplicationPdfButton
                caseId={item.id}
                label="진흥원 신청서 PDF 보기"
                className="px-3 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
        <StatusBadge status={item.status} showStep />
      </div>

      {/* 멘토 배정 후 경과일 (지연 방지용, 눈에 띄게 상단 배치) + 사업장 주소 네이버 지도 + 전화 걸기 */}
      <MentorElapsedCard
        assignedAt={item.mentorAssignedAt}
        address={item.address}
        phone={item.phone}
      />

      {/* 현재 진행 단계 네비게이션 */}
      <Card className={ACCENT_CARD.violet}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-base ${ACCENT_TITLE.violet}`}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-md ${ACCENT_BADGE.violet}`}
            >
              <Route className="h-3.5 w-3.5" />
            </span>
            현재 진행 단계
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProcessStepBar status={item.status} />
        </CardContent>
      </Card>

      {/* 업체 신청 정보 (멘토 작업 전에 먼저 확인) */}
      <CaseDetailCard item={item} accent="blue" />

      <Card className={ACCENT_CARD.coral}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-base ${ACCENT_TITLE.coral}`}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-md ${ACCENT_BADGE.coral}`}
            >
              <ListChecks className="h-3.5 w-3.5" />
            </span>
            멘토 작업
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MentorWorkflow
            caseId={item.id}
            businessName={item.business_name}
            supportTypeCode={item.supportTypeCode}
            status={item.status}
          />
        </CardContent>
      </Card>

      {editGrant && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
          <EditGrantBadge className="mr-1 align-middle" />
          넥스트랩이 임시 수정권한을 열어 두었습니다 (만료 전까지 아래에서 서류를 재업로드/수정할 수
          있습니다).
        </div>
      )}
      {editGrant && <EditGrantDocsPanel caseId={item.id} />}

      <MentorMenteePanel
        caseId={item.id}
        menteeName={mentee?.name ?? null}
        menteePhone={mentee?.phone ?? null}
        hasMentee={!!item.mentee_id}
        hasMeetingSignature={(menteeSigCount ?? 0) > 0}
      />

      {/* 멘티에게 서류 보완 요청 (관리자 기능 노출 설정에 따라 표시) */}
      {flags.supplementRequest && (
        <Card className={ACCENT_CARD.violet}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 text-base ${ACCENT_TITLE.violet}`}>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-md ${ACCENT_BADGE.violet}`}
              >
                <Bell className="h-3.5 w-3.5" />
              </span>
              멘티에게 보완 요청
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SupplementRequestForm caseId={item.id} requests={supplements} />
          </CardContent>
        </Card>
      )}

      <AttachmentFormsPanel
        caseId={item.id}
        accent="green"
        status={formStatus}
        groups={formGroups}
      />
    </div>
  );
}
