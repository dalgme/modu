import { requireNextlab } from '@/lib/auth/guards';
import { listBoardPosts } from '@/lib/data/board';
import { QnaBoard } from '@/components/board/qna-board';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireNextlab();
  const posts = await listBoardPosts();
  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘토·운영 게시판</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          멘토단의 문의·요청을 확인하고 답변합니다. 넥스트랩은 모든 글(운영사 전용 포함)을 볼 수
          있습니다.
        </p>
      </div>
      <QnaBoard posts={posts} currentUserId={profile.id} currentRole={profile.role} />
    </main>
  );
}
