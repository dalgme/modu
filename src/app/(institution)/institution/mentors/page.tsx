import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMentorsWithLoad } from '@/lib/data/members';
import { Card, CardContent } from '@/components/ui/card';

export default async function Page() {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const mentors = await listMentorsWithLoad(ctx.programId);

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">멘토 현황</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          멘토별 연락처와 현재까지 배정받은 멘티기업 수를 확인합니다. (총 {mentors.length}명)
        </p>
      </div>

      {mentors.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          등록된 멘토가 없습니다.
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* 데스크톱: 표 */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">멘토명</th>
                    <th className="px-4 py-2.5 font-medium">이메일</th>
                    <th className="px-4 py-2.5 font-medium">연락처</th>
                    <th className="px-4 py-2.5 text-right font-medium">배정 멘티 수</th>
                  </tr>
                </thead>
                <tbody>
                  {mentors.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-accent/30">
                      <td className="px-4 py-2.5 font-medium">{m.name}</td>
                      <td className="px-4 py-2.5 break-all text-muted-foreground">{m.email ?? '-'}</td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {m.phone ?? '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 font-semibold tabular-nums text-primary">
                          {m.menteeCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일: 카드 리스트 */}
            <div className="flex flex-col divide-y sm:hidden">
              {mentors.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email ?? '-'}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{m.phone ?? '-'}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-primary">
                    멘티 {m.menteeCount}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
