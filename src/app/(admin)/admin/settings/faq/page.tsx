import { requireStaff } from '@/lib/auth/guards';
import { listAllFaqs } from '@/lib/data/faqs';
import { FaqManager } from '@/components/admin/faq-manager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireStaff();
  const faqs = await listAllFaqs('mentor');

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘토 안내 FAQ 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          멘토 안내 페이지 하단에 노출되는 FAQ를 추가·수정·삭제합니다. 정렬 순서가 작을수록 위에
          표시되고, ‘게시’를 끄면 멘토에게 노출되지 않습니다.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">FAQ 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <FaqManager faqs={faqs} />
        </CardContent>
      </Card>
    </main>
  );
}
