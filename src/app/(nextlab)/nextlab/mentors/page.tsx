import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listProgramMentors } from '@/lib/data/mentors';
import { listSupportTypes } from '@/lib/programs/data';
import { MentorsRoster } from '@/components/nextlab/mentors-roster';
import { MentorFormsStatus } from '@/components/nextlab/mentor-forms-status';
import { getMentorFormStatus } from '@/lib/mentor-forms/data';
import { denyUnless } from '@/lib/auth/capabilities';

export const dynamic = 'force-dynamic';

/** 멘토 명단 (docs §15·§20) */
export default async function Page() {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  const [mentors, groups, formStatus] = await Promise.all([
    listProgramMentors(ctx.programId, ctx.supportTypeId ?? null),
    listSupportTypes(ctx.programId),
    getMentorFormStatus(ctx.programId, denyUnless(ctx, 'members.sensitive') === null),
  ]);
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘토 명단</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ctx.group ? `${ctx.group.name} · ` : ''}담당 현황 · 지급서류(이력서·통장사본·신분증사본) 수령 체크 · 그룹별 원천징수 · 운영사 평가 메모. 지급서류 체크는 비밀번호 재인증이 필요합니다.
        </p>
      </div>
      <MentorFormsStatus
        items={formStatus.map((f) => ({
          formKey: f.formKey,
          method: f.method,
          title: f.title,
          submitted: f.submitted.map((s) => ({
            id: s.id,
            mentorName: s.mentorName,
            method: s.method,
            submittedAt: s.submittedAt,
            signedName: s.signedName,
            answers: s.answers,
            contentSnapshot: s.contentSnapshot,
            fileName: s.fileName,
            fileUrl: s.fileUrl,
            rrn: s.rrn,
          })),
          missing: f.missing,
        }))}
      />
      <MentorsRoster mentors={mentors} groups={groups.map((g) => ({ id: g.id, name: g.name }))} />
    </main>
  );
}
