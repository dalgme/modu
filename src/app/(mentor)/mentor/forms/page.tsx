import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { fmt } from '@/lib/programs/branding';
import { featureEnabled } from '@/lib/platform/features';
import { getMentorFormsForMentor } from '@/lib/mentor-forms/data';
import { MentorFormsPanel } from '@/components/mentor/mentor-forms-panel';

export const dynamic = 'force-dynamic';

/** 멘토 위촉 서류 — 행사에서 사용 중인 표준 서식 제출 (웹 작성 또는 파일 첨부) */
export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  if (!featureEnabled(ctx.program.features, 'mentor_forms')) {
    return (
      <main className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">위촉 서류</h1>
        <p className="rounded-lg border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
          이 행사에서는 위촉 서류 제출 기능을 사용하지 않습니다.
        </p>
      </main>
    );
  }
  const forms = await getMentorFormsForMentor(ctx.programId, profile.id);
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">위촉 서류</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <b>{ctx.program.name}</b> 책임멘토 위촉을 위해 제출하는 서류입니다. 최초 1회 제출하며, 제출 후 수정이 필요하면 운영사에 문의하세요.
        </p>
      </div>
      <MentorFormsPanel
        forms={forms.map((f) => ({
          formKey: f.formKey,
          method: f.method,
          title: fmt(f.title, ctx.branding),
          content: fmt(f.content, ctx.branding),
          submittedAt: f.submittedAt,
          submittedMethod: f.submittedMethod,
          fileName: f.fileName,
          templateUrl: f.templateUrl,
          templateName: f.templateName,
          defaults: { organization: profile.organization ?? '', position: profile.position ?? '' },
        }))}
      />
    </main>
  );
}
