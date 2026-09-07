import { requireMentor } from '@/lib/auth/guards';
import { listBoardPosts } from '@/lib/data/board';
import { QnaBoard } from '@/components/board/qna-board';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireMentor();
  const posts = await listBoardPosts();
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">문의 및 요청하기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          넥스트랩·멘토단 공용 게시판입니다. 운영사에게만 공개하거나 모든 멘토와 함께 볼 수 있습니다.
        </p>
      </div>
      <QnaBoard posts={posts} currentUserId={profile.id} currentRole={profile.role} />
    </main>
  );
}
