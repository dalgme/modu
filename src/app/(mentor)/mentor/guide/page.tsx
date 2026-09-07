import { requireRole } from '@/lib/auth/guards';
import { listPublishedFaqs } from '@/lib/data/faqs';
import { MentorGuideContent } from '@/components/mentor/mentor-guide-content';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // 멘토 본인 + 넥스트랩·진흥원(회원 열람 시 안내 확인)도 접근 가능
  await requireRole(['mentor', 'nextlab', 'institution']);
  const faqs = await listPublishedFaqs('mentor');

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">멘토 이용 안내</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          멘토 입장에서 플랫폼을 어떻게 이용하는지, 여정별 기능과 화면을 안내합니다.
        </p>
      </div>

      <MentorGuideContent faqs={faqs} />
    </main>
  );
}
