import type { ReportFilesData } from '@/lib/data/report-files';
import { FileActions } from '@/components/files/file-preview';
import { BundleDownloadButton } from '@/components/files/bundle-download-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * 리포트 [보고서 파일] 탭 (2026-09-30) — 업로드된 회차 보고서·관찰의견서를 받는 4가지 방법.
 *  ① 회차별 파일 하나씩 (미리보기·다운로드)
 *  ② 멘토-멘티 1쌍: 그 멘티의 회차 보고서 전부 + 관찰의견서 ZIP
 *  ③ 멘토별: 멘토 폴더 / 멘티별 폴더 / 보고서·관찰의견서 ZIP
 *  ④ 라운드별: 라운드 폴더 / 멘토 폴더 / 멘티 폴더 / 보고서·관찰의견서 ZIP
 * 서버 컴포넌트 — 클라이언트 버튼에는 문자열·숫자만 넘긴다(CLAUDE.md §6-10).
 */
export function ReportFilesPanel({ data }: { data: ReportFilesData }) {
  const totalFiles = data.groups.reduce((n, g) => n + g.fileCount, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-3 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
        <p className="font-semibold">보고서 파일 받는 방법 4가지 (현재 올라온 파일 {totalFiles}개)</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs leading-relaxed">
          <li><b>회차별 하나씩</b> — 아래 멘티 표에서 회차마다 [미리보기]·[다운로드]</li>
          <li><b>멘토-멘티 1쌍</b> — 멘티 표의 [ZIP]: 그 멘티의 회차 보고서 전부 + 관찰의견서 (폴더 “멘토명-멘티명”)</li>
          <li><b>멘토별</b> — 멘토 표의 [ZIP]: “멘토명 / 멘티명 / 보고서·관찰의견서” 폴더 구조</li>
          <li><b>라운드별</b> — 라운드 표의 [ZIP]: “라운드명 / 멘토명 / 멘티명 / 보고서·관찰의견서” 폴더 구조</li>
        </ol>
        <p className="mt-1 text-[11px] opacity-80">ZIP 은 이 브라우저에서 파일을 받아 묶습니다. 파일이 많으면 1~2분 걸릴 수 있으니 창을 닫지 마세요.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">④ 라운드별 전체 ZIP</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">라운드(사업그룹)</th><th>멘티</th><th>파일</th><th className="text-right">받기</th></tr></thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={g.id} className="border-t">
                  <td className="py-2 font-medium">{g.name}</td>
                  <td className="tabular-nums">{g.caseCount}명</td>
                  <td className="tabular-nums">{g.fileCount}개</td>
                  <td className="text-right">{g.fileCount > 0 ? <BundleDownloadButton scope="group" id={g.id} label="라운드 ZIP" size="xs" /> : <span className="text-xs text-muted-foreground">파일 없음</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">③ 멘토별 ZIP</CardTitle></CardHeader>
        <CardContent className="max-h-[420px] overflow-auto">
          {data.mentors.length === 0 ? (
            <p className="text-sm text-muted-foreground">배정된 멘토가 없습니다.</p>
          ) : (
            <table className="w-full min-w-[420px] text-sm">
              <thead className="sticky top-0 bg-background text-left text-xs text-muted-foreground"><tr><th className="py-1.5">멘토</th><th>담당 멘티</th><th>파일</th><th className="text-right">받기</th></tr></thead>
              <tbody>
                {data.mentors.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="py-2 font-medium">{m.name}</td>
                    <td className="tabular-nums">{m.caseCount}명</td>
                    <td className="tabular-nums">{m.fileCount}개</td>
                    <td className="text-right">{m.fileCount > 0 ? <BundleDownloadButton scope="mentor" id={m.id} label="멘토 ZIP" size="xs" /> : <span className="text-xs text-muted-foreground">파일 없음</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">① 회차별 파일 · ② 멘토-멘티 ZIP</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 멘티가 없습니다.</p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-1.5">멘티</th><th>멘토</th><th>회차 보고서</th><th>관찰의견서</th><th className="text-right">②</th></tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const files = r.rounds.filter((x) => x.docId).length + (r.observation ? 1 : 0);
                  return (
                    <tr key={r.caseId} className="border-t align-top">
                      <td className="py-2">
                        <p className="font-medium">{r.menteeName}</p>
                        <p className="text-[11px] text-muted-foreground">{r.groupName}</p>
                      </td>
                      <td className="py-2 text-sm">{r.mentorName ?? <span className="text-muted-foreground">미배정</span>}</td>
                      <td className="py-2">
                        <div className="flex flex-col gap-1">
                          {Array.from({ length: Math.max(r.requiredRounds, r.rounds.length) }, (_, i) => i + 1).map((no) => {
                            const rd = r.rounds.find((x) => x.roundNo === no);
                            return (
                              <div key={no} className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="w-10 shrink-0 font-semibold">{no}회차</span>
                                {rd?.docId && rd.fileName ? (
                                  <>
                                    <span className="max-w-[220px] truncate text-muted-foreground" title={rd.fileName}>{rd.fileName}</span>
                                    <FileActions docId={rd.docId} name={rd.fileName} />
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">{rd ? '보고서 대기' : '미등록'}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2">
                        {r.observation ? (
                          <div className="flex flex-col gap-1 text-xs">
                            <span className="max-w-[200px] truncate text-muted-foreground" title={r.observation.name}>{r.observation.name}</span>
                            <FileActions docId={r.observation.docId} name={r.observation.name} />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">미제출</span>
                        )}
                      </td>
                      <td className="py-2 text-right">{files > 0 ? <BundleDownloadButton scope="case" id={r.caseId} label="ZIP" size="xs" /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
