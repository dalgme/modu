import { requireMentee } from '@/lib/auth/guards';
import { getMenteeCase } from '@/lib/data/cases';
import { getSupportContext, listPostSupportDocs } from '@/lib/data/support-items';
import { getMenteeSubmissionSummary } from '@/lib/data/mentee-progress';
import { PostSupportManager } from '@/components/support/post-support-manager';
import { SupportSubmitPanel } from '@/components/support/support-submit-panel';
import { PaymentDocsPanel } from '@/components/cases/payment-docs-panel';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireMentee();
  const myCase = await getMenteeCase(profile.id);
  const ctx = myCase ? await getSupportContext(myCase.id) : null;
  const summary = ctx ? await getMenteeSubmissionSummary(ctx.caseId) : null;

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">자금신청 (사후)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          공사 완료 후 대금 지급 증빙 서류를 올립니다. 부족한 서류는 언제든지 다시 올릴 수 있고, 모두
          올린 뒤 아래 <b>제출하기</b>를 눌러 주세요.
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
              phase="post"
              requiredTotal={summary.post.requiredTotal}
              presentTotal={summary.post.presentTotal}
              missing={summary.post.missing}
              submittedAt={summary.post.submittedAt}
              complete={summary.post.complete}
              editable={ctx.editable}
            />
          )}
          <PostSupportManager
            caseId={ctx.caseId}
            docs={await listPostSupportDocs(ctx.caseId)}
            editable={ctx.editable}
          />
          {ctx.supportTypeCode === 'closure' && <PaymentDocsPanel caseId={ctx.caseId} />}
        </>
      )}
    </main>
  );
}
