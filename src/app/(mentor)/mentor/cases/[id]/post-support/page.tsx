import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { requireMentor } from '@/lib/auth/guards';
import { getSupportContext, listPostSupportDocs } from '@/lib/data/support-items';
import { getMenteeSubmissionSummary } from '@/lib/data/mentee-progress';
import { PostSupportManager } from '@/components/support/post-support-manager';
import { SupportSubmitPanel } from '@/components/support/support-submit-panel';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  await requireMentor();
  const ctx = await getSupportContext(params.id);
  if (!ctx) notFound();
  const summary = await getMenteeSubmissionSummary(ctx.caseId);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/mentor/cases/${ctx.caseId}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            케이스로 이동
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">자금신청 (사후) · 대리 작성</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.businessName} — 멘티를 대신해 대금 지급 증빙 서류를 업로드할 수 있습니다.
        </p>
      </div>

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

      <PostSupportManager
        caseId={ctx.caseId}
        docs={await listPostSupportDocs(ctx.caseId)}
        editable={ctx.editable}
      />
    </main>
  );
}
