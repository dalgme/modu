import Link from 'next/link';
import { Check, Lock, NotebookPen, FileText, Send, Paperclip, PenLine } from 'lucide-react';

import { getMentorWorkflowState } from '@/lib/data/mentor-workflow';
import { listMentoringLogs, listMentoringReportFiles } from '@/lib/data/mentoring-logs';
import { listCaseDocsByKey } from '@/lib/data/case-docs';
import { getContractorConfig, contractorCompanyStatuses } from '@/lib/data/contractor-config';
import { listConsultingReports } from '@/lib/workflow/consulting-report-actions';
import { ConsultingReportBlock } from '@/components/cases/consulting-report-block';
import { SubmitApplicationButton } from '@/components/cases/submit-application-button';
import { CaseDocUpload } from '@/components/cases/case-doc-upload';
import { PledgeGenerateButton } from '@/components/cases/pledge-generate-button';
import { ContractorSetup } from '@/components/cases/contractor-setup';
import { PaymentDocSteps } from '@/components/cases/payment-doc-steps';
import { StepShell, type StepState } from '@/components/cases/step-shell';
import { FileActions } from '@/components/cases/file-actions';
import { formatWallClock } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import type { CaseStatus } from '@/types/case-status';

const smallLinkCls =
  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

const linkCls = (done: boolean) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
    done
      ? 'border border-status-approved/40 bg-status-approved/10 text-status-approved hover:bg-status-approved/15'
      : 'bg-primary text-primary-foreground hover:bg-primary/90',
  );

/**
 * 멘토 작업 — 5단계 가이드 플로우.
 * 1) 멘토링 일지(회차별 첨부/웹) → 2) 컨설팅 결과보고서 생성 → 3) 지원신청서 →
 * 4) 공사업체 서류 업로드 → 5) 신청서 송신하기. 각 단계는 앞 단계 완료 후 활성화된다.
 */
export async function MentorWorkflow({
  caseId,
  businessName,
  supportTypeCode,
  status,
}: {
  caseId: string;
  businessName: string;
  supportTypeCode: string | null;
  status: CaseStatus;
}) {
  const s = await getMentorWorkflowState(caseId, supportTypeCode, status);
  const reports = s.consultingEnabled ? await listConsultingReports(caseId) : [];
  const [webLogs, reportFiles] = await Promise.all([
    listMentoringLogs(caseId),
    listMentoringReportFiles(caseId),
  ]);
  const appDocs = s.applicationEnabled
    ? [
        ...(await listCaseDocsByKey(caseId, 'support_application')),
        ...(await listCaseDocsByKey(caseId, 'support_application_file')),
      ]
    : [];
  // 사업참여 및 중복지원 금지 확약서(붙임6) — 웹 생성본(form_pledge_no_overlap)·업로드본(pledge_no_overlap_file) 분리
  const pledgeGenerated = s.applicationEnabled
    ? await listCaseDocsByKey(caseId, 'form_pledge_no_overlap')
    : [];
  const pledgeUploaded = s.applicationEnabled
    ? await listCaseDocsByKey(caseId, 'pledge_no_overlap_file')
    : [];
  const contractorConfig = s.contractorEnabled ? await getContractorConfig(caseId) : null;
  const companyStatuses = contractorConfig
    ? await contractorCompanyStatuses(caseId, contractorConfig)
    : [];

  // 1) 멘토링 일지 상태
  const logState: StepState = s.roundsDone >= s.min ? 'done' : 'active';
  const rounds = Array.from({ length: s.max }, (_, i) => i + 1);

  // 2) 컨설팅 결과보고서
  const consultingState: StepState = s.consultingDone
    ? 'done'
    : s.consultingEnabled
      ? 'active'
      : 'locked';
  const consultingGate = `${s.isClosure ? '1차' : '2차'} 멘토링 입력(첨부·작성) 완료 후 활성화됩니다.`;

  // 3) 지원신청서
  const applicationState: StepState = s.applicationFinalized
    ? 'done'
    : s.applicationEnabled
      ? 'active'
      : 'locked';

  // 4) 공사업체 서류
  const contractorState: StepState = s.contractorDocsDone
    ? 'done'
    : s.contractorEnabled
      ? 'active'
      : 'locked';

  // 폐업: 지원금신청서 제출본 존재 여부 (경영지원의 '공사업체 서류 완료' 대신 송신 게이트로 사용)
  const closurePaymentDone = s.isClosure
    ? (await listCaseDocsByKey(caseId, 'payment_application_file')).length > 0
    : false;

  // 5) 송신
  const submitEnabled = s.isClosure ? closurePaymentDone : s.submitEnabled;
  const submitState: StepState = s.submitted ? 'done' : submitEnabled ? 'active' : 'locked';

  return (
    <div className="flex flex-col gap-3">
      {/* 1) 멘토링 일지 */}
      <StepShell
        n={1}
        title="멘토링 일지"
        state={logState}
        subtitle={`회차별 보고서를 첨부(기본)하거나 웹에서 작성 · ${s.typeLabel} 최소 ${s.min}회 (현재 ${s.roundsDone}회)`}
      >
        <div className="flex flex-wrap gap-2">
          {rounds.map((r) => {
            const done = r <= s.roundsDone;
            return (
              <Link key={r} href={`/mentor/cases/${caseId}/log?round=${r}`} className={linkCls(done)}>
                {done ? <Check className="h-4 w-4" /> : <NotebookPen className="h-4 w-4" />}
                {r}차 멘토링{r > s.min ? '(추가)' : ''}
              </Link>
            );
          })}
        </div>

        {(webLogs.length > 0 || reportFiles.length > 0) && (
          <div className="mt-3 flex flex-col gap-1.5">
            {webLogs.map((l, i) => (
              <div
                key={l.id}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm"
              >
                <NotebookPen className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">
                  {i + 1}회차 · {formatWallClock(l.visited_at)}
                  {l.topic ? ` · ${l.topic}` : ''}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <Link href={`/mentor/cases/${caseId}/log/${l.id}/edit`} className={smallLinkCls}>
                    수정
                  </Link>
                  <Link href={`/mentor/cases/${caseId}/log/${l.id}/view`} className={smallLinkCls}>
                    미리보기
                  </Link>
                </span>
              </div>
            ))}
            {reportFiles.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <FileActions
                  url={f.url}
                  downloadUrl={f.downloadUrl}
                  previewable={f.previewable}
                  className="ml-auto"
                />
              </div>
            ))}
          </div>
        )}
      </StepShell>

      {/* 2) 컨설팅 결과보고서 생성 */}
      <StepShell n={2} title="컨설팅 결과보고서 생성" state={consultingState}>
        <ConsultingReportBlock
          caseId={caseId}
          enabled={s.consultingEnabled}
          gateHint={consultingGate}
          reports={reports}
        />
      </StepShell>

      {/* 폐업: 3) 지원금신청서 · 4) 지급 증빙서류 (경영지원 구조를 승계한 폐업 전용 단계) */}
      {s.isClosure ? (
        <PaymentDocSteps caseId={caseId} startN={3} editable />
      ) : (
        <>
      {/* 3) 지원신청서 */}
      <StepShell
        n={3}
        title="지원신청서"
        state={applicationState}
        subtitle="컨설팅 결과보고서 생성·업로드 후 작성할 수 있습니다."
      >
        {s.applicationEnabled ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/mentor/cases/${caseId}/apply?mode=attach`}
              className={linkCls(s.applicationFinalized)}
            >
              <Paperclip className="h-4 w-4" />
              신청서 파일첨부(업로드)
            </Link>
            <Link
              href={`/mentor/cases/${caseId}/apply?mode=web`}
              className={linkCls(s.applicationFinalized)}
            >
              <PenLine className="h-4 w-4" />
              웹에서 작성하기
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            컨설팅 결과보고서를 먼저 생성하거나 업로드하세요.
          </div>
        )}

        {appDocs.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {appDocs.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{d.name}</span>
                <FileActions
                  url={d.url}
                  downloadUrl={d.downloadUrl}
                  previewable={d.previewable}
                  className="ml-auto"
                />
              </div>
            ))}
          </div>
        )}

        {/* 사업참여 및 중복지원 금지 확약서 (붙임6) — 웹 작성(생성) 또는 업로드 */}
        {s.applicationEnabled && (
          <div className="mt-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">사업참여 및 중복지원 금지 확약서 (붙임6)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  업체정보를 채워 웹에서 바로 생성하거나, 완성본 파일을 업로드하세요. (멘티 서명 필요)
                </p>
              </div>
              <PledgeGenerateButton caseId={caseId} done={pledgeGenerated.length > 0} />
            </div>
            {pledgeGenerated.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {pledgeGenerated.slice(-1).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <FileActions
                      url={d.url}
                      downloadUrl={d.downloadUrl}
                      previewable={d.previewable}
                      className="ml-auto"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2">
              <CaseDocUpload
                caseId={caseId}
                docKey="pledge_no_overlap_file"
                label="확약서 파일첨부(업로드)"
                files={pledgeUploaded}
                multiple={false}
                uploadLabel="확약서 파일첨부(업로드)"
                hint="완성한 확약서(붙임6) 파일을 대신 업로드할 수도 있습니다."
              />
            </div>
          </div>
        )}

        {/* 멘티기업 사업자등록증 업로드 UI 는 지원신청서 단계에서 노출하지 않는다(운영 요청). */}
      </StepShell>

      {/* 4) 공사업체 서류 업로드 */}
      <StepShell
        n={4}
        title="공사업체 서류 업로드"
        state={contractorState}
        subtitle="업체 수·간판 구성을 설정하면 업체 버튼이 생성됩니다. 각 업체 버튼에서 서류를 업로드하세요."
      >
        {s.contractorEnabled ? (
          <div className="flex flex-col gap-3">
            <ContractorSetup caseId={caseId} initial={contractorConfig} />
            {contractorConfig && companyStatuses.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-muted-foreground">
                  업체별 서류 업로드 (버튼을 눌러 해당 업체 서류를 올리세요)
                </p>
                <div className="flex flex-wrap gap-2">
                  {companyStatuses.map((c) => (
                    <Link
                      key={c.index}
                      href={`/mentor/cases/${caseId}/contractor-docs?company=${c.index}`}
                      className={linkCls(c.done)}
                    >
                      {c.done ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      업체 {c.index}
                      {c.isSignage ? '(간판)' : ''}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            지원신청서를 최종 저장한 후 활성화됩니다.
          </div>
        )}
      </StepShell>
        </>
      )}

      {/* 5) 신청서 송신하기 */}
      <StepShell n={5} title="신청서 송신하기" state={submitState}>
        {s.submitted ? (
          <div className="flex items-center gap-2 rounded-md border border-status-approved/40 bg-status-approved/10 px-3 py-2.5 text-sm font-medium text-status-approved">
            <Send className="h-4 w-4 shrink-0" />
            신청서가 송신되었습니다. 넥스트랩 검수가 진행 중입니다.
          </div>
        ) : submitEnabled ? (
          <div className="flex flex-col gap-2">
            <SubmitApplicationButton
              caseId={caseId}
              label={`${businessName} ${s.isClosure ? '폐업지원' : '경영개선'} 신청서 송신하기`}
            />
            <p className="text-xs text-muted-foreground">
              송신하면 넥스트랩 담당자에게 접수 알림과 문자가 발송되고 검수가 시작됩니다. (넥스트랩 검수
              완료 시 진흥원 담당자에게 통보됩니다.)
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            {s.isClosure
              ? '지원금신청서를 올린 후 활성화됩니다.'
              : '공사업체 필수 서류 업로드 후 활성화됩니다.'}
          </div>
        )}
      </StepShell>
    </div>
  );
}
