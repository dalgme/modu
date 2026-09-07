import type { Tables } from '@/types/database';
import { getCaseById } from '@/lib/data/cases';
import { getSupportTypeWithDocs } from '@/lib/data/support-types';
import { getDocumentCountsByKey } from '@/lib/data/documents';
import { StatusBadge } from '@/components/cases/status-badge';
import { CaseDetailCard } from '@/components/cases/case-detail-card';
import { ApplicationPdfButton } from '@/components/cases/application-pdf-button';
import { MentorCaseDetailBody } from '@/components/cases/mentor-case-detail-body';
import { MenteeJourney } from '@/components/cases/mentee-journey';
import { MenteeChecklist } from '@/components/cases/mentee-checklist';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils/format';

/**
 * 회원 열람(view-as) 중 케이스 카드를 눌렀을 때, 열람 상태를 유지한 채 해당 회원이 실제
 * 로그인했을 때 보는 케이스 상세 화면을 그대로 보여준다.
 * (관리자가 회원이 보는 화면·버튼을 정확히 동일하게 진단하기 위한 화면)
 *
 * - 멘토: 실제 멘토 케이스 상세와 100% 동일한 MentorCaseDetailBody 를 렌더한다.
 *   (액션 버튼은 멘토 전용 가드로 넥스트랩이 눌러도 거부된다. 이때 리다이렉트하지 않고
 *    { ok:false, error } 를 돌려주므로 열람 상태가 유지된 채 안내 토스트만 뜬다.)
 */
export async function ViewAsCaseDetail({
  target,
  caseId,
}: {
  target: Tables<'users'>;
  caseId: string;
}) {
  const item = await getCaseById(caseId);
  if (!item) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        케이스를 찾을 수 없습니다.
      </div>
    );
  }

  // 멘토가 실제 로그인했을 때 보는 케이스 상세와 완전히 동일한 화면
  if (target.role === 'mentor') {
    return <MentorCaseDetailBody item={item} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{item.business_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            대표자 {item.owner_name} · 등록 {formatDate(item.created_at)}
            {item.mentorName ? ` · 담당 멘토 ${item.mentorName}` : ''}
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

      {target.role === 'mentee' && <MenteePreview item={item} />}

      <CaseDetailCard item={item} />
    </div>
  );
}

/** 멘티 관점: 진행 여정 + 준비 서류 안내(읽기 전용) */
async function MenteePreview({ item }: { item: Awaited<ReturnType<typeof getCaseById>> }) {
  if (!item) return null;
  const [typeWithDocs, counts] = await Promise.all([
    getSupportTypeWithDocs(item.support_type_id),
    getDocumentCountsByKey(item.id),
  ]);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">진행 여정</CardTitle>
        </CardHeader>
        <CardContent>
          <MenteeJourney status={item.status} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">준비 서류 안내</CardTitle>
        </CardHeader>
        <CardContent>
          <MenteeChecklist
            supportTypeName={typeWithDocs?.name ?? item.supportTypeName ?? '-'}
            documents={typeWithDocs?.documents ?? []}
            counts={counts}
          />
        </CardContent>
      </Card>
    </div>
  );
}
