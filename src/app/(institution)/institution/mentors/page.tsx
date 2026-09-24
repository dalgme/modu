import { requireInstitution } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { listMentorsWithLoad } from '@/lib/data/members';
import { Card, CardContent } from '@/components/ui/card';

export default async function Page() {
  const profile = await requireInstitution();
  const ctx = await requireContext(profile);
  const mentors = await listMentorsWithLoad(ctx.programId);
  // (P31) 서류 일괄 ZIP 은 행사 설정 staff_permissions.institution_docs_zip 이 켜진 발주처만 — 라우트(/api/staff/mentor-docs-zip)와 같은 판정
  const perms = ctx.program.staff_permissions;
  const zipAllowed = !!perms && typeof perms === 'object' && !Array.isArray(perms) && (perms as Record<string, unknown>).institution_docs_zip === true;
  // (P32) 멘토 서류 수령 체크(읽기 전용) — 한 명이라도 체크리스트가 적용되면 컬럼 표시
  const showChecklist = mentors.some((m) => m.checklist !== null);

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">멘토 현황</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            멘토별 연락처와 현재까지 배정받은 멘티기업 수를 확인합니다. (총 {mentors.length}명)
          </p>
        </div>
        {zipAllowed ? (
          <a
            href="/api/staff/mentor-docs-zip"
            title="멘토별 폴더로 정리된 ZIP — 멘토가 올린 지급서류(이력서·통장·신분증) 파일"
            className="inline-flex items-center gap-1 rounded-lg border bg-background px-3 py-2 text-sm font-semibold hover:bg-accent"
          >
            멘토 서류 일괄 다운로드 (ZIP)
          </a>
        ) : (
          <span
            title="개인정보 서류 일괄 반출은 운영사가 행사 설정(담당 권한 › 발주처 옵션)에서 허용한 경우에만 가능합니다."
            className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border bg-muted px-3 py-2 text-sm font-semibold text-muted-foreground"
            aria-disabled="true"
          >
            멘토 서류 일괄 다운로드 (운영사 허용 필요)
          </span>
        )}
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
                    <th className="px-4 py-2.5 text-right font-medium" title="이력서·통장사본·신분증사본 3종">지급서류 제출</th>
                    <th className="px-4 py-2.5 text-right font-medium">수령 확인</th>
                    {showChecklist && <th className="px-4 py-2.5 text-right font-medium" title="운영사가 오프라인으로 받은 서류(동의서·서약서 등)의 수령 체크">서류 수령</th>}
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
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={m.docsSubmitted === 3 ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}>{m.docsSubmitted}/3</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={m.docsReceived === 3 ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}>{m.docsReceived}/3</span>
                      </td>
                      {showChecklist && (
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {m.checklist ? <span className={m.checklist.received === m.checklist.total ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}>{m.checklist.received}/{m.checklist.total}</span> : <span className="text-muted-foreground">-</span>}
                        </td>
                      )}
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
