import { requireNextlab } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { AppHeader } from '@/components/common/app-header';
import { NextlabNav } from '@/components/nextlab/nextlab-nav';
import { GRADE_LABELS } from '@/lib/auth/capabilities';

export default async function NextlabLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireNextlab();
  const ctx = await requireContext(profile);
  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader
        name={profile.name}
        role={profile.role}
        branding={ctx.branding}
        context={{ programName: ctx.program.name, groupName: ctx.group?.name ?? null }}
        gradeLabel={ctx.grade && ctx.grade !== 'pl' ? GRADE_LABELS[ctx.grade] : null}
      />
      <NextlabNav />
      {ctx.grade === 'observer' && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800">
          옵저버(현황 확인·자문) 계정입니다. 열람과 종합결과리포트 생성만 가능하고, 변경 작업은 제한됩니다.
        </p>
      )}
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
