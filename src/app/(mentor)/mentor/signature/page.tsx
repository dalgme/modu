import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { getMentorSignatureDataUrl } from '@/lib/documents/round-report';
import { MentorSignatureForm } from '@/components/mentor/mentor-signature-form';

export const dynamic = 'force-dynamic';

/** 멘토 서명 등록 — 보고서 양식에 멘토 서명 컬럼이 있고 자동 서명 정책이 켜진 그룹에서 회차 저장 시 자동으로 붙는다. */
export default async function Page() {
  const profile = await requireMentor();
  await requireContext(profile);
  const current = await getMentorSignatureDataUrl(profile.id);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">내 서명 등록</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          등록한 서명은 컨설팅 보고서를 작성·저장할 때 자동으로 붙습니다(운영사가 보고서 양식에 멘토 서명 컬럼을 두고 자동 서명을 켠 그룹에 한함). 서명은 본인만 등록·교체할 수 있습니다.
        </p>
      </div>
      <MentorSignatureForm current={current} />
    </main>
  );
}
