import { requireMentee } from '@/lib/auth/guards';
import { getMenteeCase } from '@/lib/data/cases';
import { getSupportContext, listSupportItems } from '@/lib/data/support-items';
import { getMenteeSubmissionSummary } from '@/lib/data/mentee-progress';
import { PreSupportManager } from '@/components/support/pre-support-manager';
import { SupportSubmitPanel } from '@/components/support/support-submit-panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireMentee();
  const myCase = await getMenteeCase(profile.id);
  const ctx = myCase ? await getSupportContext(myCase.id) : null;
  const summary = ctx ? await getMenteeSubmissionSummary(ctx.caseId) : null;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">지원신청 (사전)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          신청단위(공사·설비 항목)별로 필요한 서류를 올립니다. 부족한 서류는 언제든지 다시 올릴 수
          있고, 모두 올린 뒤 아래 <b>제출하기</b>를 눌러 주세요.
        </p>
      </div>

      {!ctx ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          아직 연결된 케이스가 없습니다. 운영팀의 안내를 기다려 주세요.
        </div>
      ) : (
        <>
          {summary && (
            <SupportSubmitPanel
              caseId={ctx.caseId}
              phase="pre"
              requiredTotal={summary.pre.requiredTotal}
              presentTotal={summary.pre.presentTotal}
              missing={summary.pre.missing}
              submittedAt={summary.pre.submittedAt}
              complete={summary.pre.complete}
              editable={ctx.editable}
            />
          )}
          <PreSupportManager
            caseId={ctx.caseId}
            items={await listSupportItems(ctx.caseId)}
            limitAmount={ctx.limitAmount}
            editable={ctx.editable}
          />
        </>
      )}
    </main>
  );
}
