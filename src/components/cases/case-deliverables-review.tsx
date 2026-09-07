import Link from 'next/link';
import { NotebookPen, FileText, Paperclip, Building2 } from 'lucide-react';

import { getMentorWorkflowState } from '@/lib/data/mentor-workflow';
import { listMentoringLogs, listMentoringReportFiles } from '@/lib/data/mentoring-logs';
import { listCaseDocsByKey, listCaseDocsByPrefix, type CaseDocFile } from '@/lib/data/case-docs';
import { getContractorConfig } from '@/lib/data/contractor-config';
import { StepShell, type StepState } from '@/components/cases/step-shell';
import { PaymentDocSteps } from '@/components/cases/payment-doc-steps';
import { ConsultingReportRegenerateButton } from '@/components/cases/consulting-report-regenerate-button';
import { FileActions } from '@/components/cases/file-actions';
import { formatWallClock } from '@/lib/utils/format';
import type { CaseStatus } from '@/types/case-status';

const rowCls = 'flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm';
const smallLinkCls =
  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

interface FileRowItem {
  id: string;
  name: string;
  url: string | null;
  downloadUrl: string | null;
  previewable: boolean;
}

function FileRow({ file }: { file: FileRowItem }) {
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

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

/** contractor_* doc_key 의 끝 숫자를 업체 index 로 파싱 (예: contractor_estimate_1 → 1) */
function companyIndexOf(docKey: string | null): number | null {
  if (!docKey) return null;
  const m = docKey.match(/_(\d+)(?:_\d+)?$/);
  return m ? Number(m[1]) : null;
}

/**
 * 검수용 읽기전용 '멘티 관리(멘토 작업)' 뷰.
 * 멘토가 준비한 산출물(멘토링 일지·컨설팅 결과보고서·지원신청서·멘티 사업자등록증·공사업체 서류)을
 * 멘토 화면과 동일한 단계형 레이아웃으로 열람/다운로드만 가능하게 보여준다.
 * 넥스트랩·진흥원 검수 화면에서 사용(멘토 작업 버튼은 없음).
 */
export async function CaseDeliverablesReview({
  caseId,
  supportTypeCode,
  status,
  logViewBase,
  paymentUpload = false,
  canRegenerateReport = false,
}: {
  caseId: string;
  supportTypeCode: string | null;
  status: CaseStatus;
  /** 멘토링 일지 미리보기 링크 베이스 (예: /nextlab/cases/{id}/log) */
  logViewBase: string;
  /** 폐업 지원금신청서 단계에서 업로드 허용 여부(넥스트랩=true, 진흥원=false) */
  paymentUpload?: boolean;
  /** 컨설팅 결과보고서 재생성 버튼 노출 여부(넥스트랩=true, 진흥원=false) */
  canRegenerateReport?: boolean;
}) {
  const isClosure = supportTypeCode === 'closure';
  const [
    s,
    webLogs,
    reportFiles,
    consultingReports,
    appWeb,
    appFiles,
    bizRegFiles,
    pledgeGen,
    pledgeUp,
    contractorDocs,
    contractorConfig,
  ] = await Promise.all([
    getMentorWorkflowState(caseId, supportTypeCode, status),
    listMentoringLogs(caseId),
    listMentoringReportFiles(caseId),
    listCaseDocsByKey(caseId, 'consulting_report'),
    listCaseDocsByKey(caseId, 'support_application'),
    listCaseDocsByKey(caseId, 'support_application_file'),
    listCaseDocsByKey(caseId, 'applicant_biz_reg'),
    listCaseDocsByKey(caseId, 'form_pledge_no_overlap'),
    listCaseDocsByKey(caseId, 'pledge_no_overlap_file'),
    listCaseDocsByPrefix(caseId, 'contractor_'),
    getContractorConfig(caseId),
  ]);

  const appDocs = [...appWeb, ...appFiles];
  const pledgeDocs = [...pledgeGen, ...pledgeUp];

  // 공사업체 서류 업체별 그룹핑
  const byCompany = new Map<number, CaseDocFile[]>();
  const otherContractor: CaseDocFile[] = [];
  for (const d of contractorDocs) {
    const idx = companyIndexOf(d.docKey);
    if (idx == null) otherContractor.push(d);
    else {
      const arr = byCompany.get(idx);
      if (arr) arr.push(d);
      else byCompany.set(idx, [d]);
    }
  }
  const companyIndexes = Array.from(byCompany.keys()).sort((a, b) => a - b);
  const signageIdx = contractorConfig?.signageIncluded ? contractorConfig.signageCompanyIndex : null;

  const st = (done: boolean): StepState => (done ? 'done' : 'active');

  /**
   * 현재 컨설팅 결과보고서 중 '멘토가 직접 올린 완성본'의 파일명.
   * 자동 생성본은 '컨설팅 결과보고서(병합·…)' 또는 레거시 '컨설팅 결과보고서(생성)' 이름을 갖는다.
   * 재생성은 기존 보고서를 삭제·교체하므로, 업로드 원본이 있으면 사전에 경고한다.
   */
  const uploadedReportNames = consultingReports
    .map((f) => f.name)
    .filter((n) => !n.startsWith('컨설팅 결과보고서(병합') && n !== '컨설팅 결과보고서(생성)');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">멘티 관리 (멘토 산출물 검수)</h2>
        <span className="text-xs text-muted-foreground">
          {isClosure && paymentUpload
            ? '멘토 산출물은 열람 전용 · 지원금신청서는 업로드 가능'
            : '열람·다운로드 전용'}
        </span>
      </div>

      {/* 1) 멘토링 일지 */}
      <StepShell n={1} title="멘토링 일지" state={st(s.roundsDone > 0)}>
        {webLogs.length === 0 && reportFiles.length === 0 ? (
          <EmptyRow text="작성/첨부된 멘토링 일지가 없습니다." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {webLogs.map((l, i) => (
              <div key={l.id} className={rowCls}>
                <NotebookPen className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">
                  {i + 1}회차 · {formatWallClock(l.visited_at)}
                  {l.topic ? ` · ${l.topic}` : ''}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <Link href={`${logViewBase}/${l.id}/view`} className={smallLinkCls}>
                    미리보기
                  </Link>
                  <a href={`/api/cases/${caseId}/log/${l.id}/pdf`} className={smallLinkCls}>
                    다운로드
                  </a>
                </span>
              </div>
            ))}
            {reportFiles.map((f) => (
              <FileRow key={f.id} file={f} />
            ))}
          </div>
        )}
      </StepShell>

      {/* 2) 컨설팅 결과보고서(종합보고서) */}
      <StepShell n={2} title="컨설팅 결과보고서" state={st(consultingReports.length > 0)}>
        {consultingReports.length === 0 ? (
          <EmptyRow text="생성/업로드된 컨설팅 결과보고서가 없습니다." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {consultingReports.map((f) => (
              <FileRow key={f.id} file={f} />
            ))}
          </div>
        )}
        {canRegenerateReport && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2">
            <p className="text-xs text-muted-foreground">
              회차가 빠져 있나요? 멘토링 일지 <b className="text-foreground">전체 회차</b>를 병합해 다시
              만듭니다. (2026-08-14 이전 생성분은 마지막 1회차만 담겨 있습니다)
              <br />
              멘토링 일지·회차 보고서·현장사진 <b className="text-foreground">원본은 변경되지 않습니다</b>.
              {uploadedReportNames.length > 0 && (
                <>
                  <br />
                  <b className="text-status-rejected">
                    ⚠ 현재 보고서는 멘토가 직접 올린 파일({uploadedReportNames.join(', ')})입니다.
                    재생성하면 이 파일은 삭제되며 되돌릴 수 없습니다.
                  </b>
                </>
              )}
            </p>
            <ConsultingReportRegenerateButton
              caseId={caseId}
              uploadedReportNames={uploadedReportNames}
            />
          </div>
        )}
      </StepShell>

      {/* 폐업: 3) 지원금신청서 · 4) 지급 증빙서류 (경영지원 구조를 승계한 폐업 전용 단계) */}
      {isClosure ? (
        <PaymentDocSteps caseId={caseId} startN={3} editable={paymentUpload} />
      ) : (
        <>
      {/* 3) 지원신청서 + 멘티기업 사업자등록증 */}
      <StepShell n={3} title="지원신청서" state={st(appDocs.length > 0 && bizRegFiles.length > 0)}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground">지원신청서</p>
            {appDocs.length === 0 ? (
              <EmptyRow text="지원신청서가 없습니다." />
            ) : (
              appDocs.map((f) => <FileRow key={f.id} file={f} />)
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Paperclip className="h-3.5 w-3.5" /> 멘티기업 사업자등록증
            </p>
            {bizRegFiles.length === 0 ? (
              <EmptyRow text="멘티기업 사업자등록증이 없습니다." />
            ) : (
              bizRegFiles.map((f) => <FileRow key={f.id} file={f} />)
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              사업참여 및 중복지원 금지 확약서
            </p>
            {pledgeDocs.length === 0 ? (
              <EmptyRow text="확약서가 없습니다." />
            ) : (
              pledgeDocs.map((f) => <FileRow key={f.id} file={f} />)
            )}
          </div>
        </div>
      </StepShell>

      {/* 4) 공사업체 서류 */}
      <StepShell n={4} title="공사업체 서류" state={st(s.contractorDocsDone)}>
        {contractorDocs.length === 0 ? (
          <EmptyRow text="업로드된 공사업체 서류가 없습니다." />
        ) : (
          <div className="flex flex-col gap-3">
            {companyIndexes.map((idx) => (
              <div key={idx} className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> 업체 {idx}
                  {signageIdx === idx ? '(간판)' : ''}
                </p>
                {byCompany.get(idx)!.map((f) => (
                  <FileRow key={f.id} file={f} />
                ))}
              </div>
            ))}
            {otherContractor.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-muted-foreground">기타 공사업체 서류</p>
                {otherContractor.map((f) => (
                  <FileRow key={f.id} file={f} />
                ))}
              </div>
            )}
          </div>
        )}
      </StepShell>
        </>
      )}
    </div>
  );
}
