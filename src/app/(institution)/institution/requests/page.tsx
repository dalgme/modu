import { requireInstitution } from '@/lib/auth/guards';
import { listMyOperatorRequests } from '@/lib/data/operator-requests';
import { OperatorRequestForm } from '@/components/cases/operator-request-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const profile = await requireInstitution();
  const requests = await listMyOperatorRequests(profile.id);

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">요청 / 문의</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          넥스트랩(운영사)에 처리 요청이나 문의사항을 간단히 등록합니다.
        </p>
      </div>

      <OperatorRequestForm />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">내가 보낸 요청 ({requests.length})</h2>
        {requests.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            아직 보낸 요청이 없습니다. 위에서 요청을 등록해 주세요.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r) => {
              const read = !!r.read_at;
              return (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">
                        {r.title}
                        {r.businessName && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            · {r.businessName}
                          </span>
                        )}
                      </CardTitle>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                          read
                            ? 'bg-status-approved/10 text-status-approved'
                            : 'bg-status-progress/10 text-status-progress',
                        )}
                      >
                        {read ? '넥스트랩 확인' : '전달됨 · 확인대기'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.body}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
