import type { ReportFilesData } from '@/lib/data/report-files';
import { FileActions } from '@/components/files/file-preview';
import { BundleDownloadButton } from '@/components/files/bundle-download-button';
import { RoundPackageButton } from '@/components/files/round-package-button';
import { ObservationBundleButton } from '@/components/files/observation-bundle-button';
import { MergedReportBulkButton, MergedReportButton } from '@/components/files/merged-report-button';
import { mergedProps } from '@/components/files/merged-report-section';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ObservationMissingPanel } from '@/components/reports/observation-missing-panel';

/**
 * 리포트 [보고서 파일] 탭 (2026-09-30) — 업로드된 회차 보고서·관찰의견서를 받는 4가지 방법.
 *  ① 회차별 파일 하나씩 (미리보기·다운로드)
 *  ② 멘토-멘티 1쌍: 그 멘티의 회차 보고서 전부 + 관찰의견서 ZIP
 *  ③ 멘토별: 멘토 폴더 / 멘티별 폴더 / 보고서·관찰의견서 ZIP
 *  ④ 라운드별: 라운드 폴더 / 멘토 폴더 / 멘티 폴더 / 보고서·관찰의견서 ZIP
 * 서버 컴포넌트 — 클라이언트 버튼에는 문자열·숫자만 넘긴다(CLAUDE.md §6-10).
 */
export function ReportFilesPanel({ data, canSms = false, groupId = null, caseHrefBase = '/nextlab/cases' }: { data: ReportFilesData; canSms?: boolean; groupId?: string | null; caseHrefBase?: string }) {
  const totalFiles = data.groups.reduce((n, g) => n + g.fileCount, 0);
  const missingTotal = data.obsMissing.rows.filter((r) => !r.outcomeLabel).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-3 text-sm text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
        <p className="font-semibold">보고서 파일 받는 방법 4가지 (현재 올라온 파일 {totalFiles}개)</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs leading-relaxed">
          <li><b>회차별 하나씩</b> — 아래 멘티 표에서 회차마다 [미리보기]·[다운로드]</li>
          <li><b>멘토-멘티 1쌍</b> — 멘티 표의 [ZIP]: 그 멘티의 회차 보고서 전부 + 관찰의견서 (폴더 “멘토명-멘티명”)</li>
          <li><b>멘토별</b> — 멘토 표의 [ZIP]: “멘토명 / 멘티명 / 보고서·관찰의견서” 폴더 구조</li>
          <li><b>라운드별</b> — 라운드 표의 [ZIP]: “라운드명 / 멘토명 / 멘티명 / 보고서·관찰의견서” 폴더 구조</li>
          <li><b>멘티별 합본 PDF</b> — 멘티마다 회차 보고서를 회차 순서대로 <b>PDF 한 개</b>로 합쳐 따로 저장해 두고 받습니다(아래 ‘멘티별 회차 보고서 합본’ · 멘티 표의 [합본 PDF])</li>
        </ol>
        <p className="mt-1 text-[11px] opacity-80">ZIP 은 이 브라우저에서 파일을 받아 묶습니다. 파일이 많으면 1~2분 걸릴 수 있으니 창을 닫지 마세요.</p>
        <p className="mt-1 text-[11px] opacity-80">
          멘티 수에는 회차를 한 번도 진행하지 않고 끝난 멘티(멘토링 포기·종료 표시·중도 종료·비활성화)를 넣지 않습니다{data.excludedCount > 0 ? ` — 이번 범위에서 ${data.excludedCount}명 제외` : ''}. 1회 이상 진행한 뒤 포기·종료한 멘티는 그대로 셉니다.
        </p>
      </div>

      <Card className="border-2 border-emerald-300 dark:border-emerald-800">
        <CardHeader>
          <CardTitle className="text-base">멘티별 회차 보고서 합본 PDF</CardTitle>
          <p className="text-xs text-muted-foreground">
            멘티 한 명의 회차 보고서(1회차 → 마지막 회차)를 <b>PDF 한 개</b>로 합쳐 플랫폼에 따로 저장합니다. 저장된 합본은 아래 멘티 표의 [합본 PDF]에서 바로 [미리보기]·[다운로드]할 수 있습니다.
            <br />보고서가 새로 올라오거나 바뀌면 ‘다시 만들기’가 표시됩니다. 예전에 올라온 한글(HWP·HWPX) 보고서는 이 브라우저에서 PDF 쪽으로 바꿔 합칩니다(원본과 줄바꿈·표 위치가 조금 다를 수 있음 — 2026-11-16 부터 멘토는 PDF 파일만 올립니다). 바꾸지 못한 파일(암호·배포용·Word 등)은 빠진 회차로 알려 드립니다.
            <br />라운드 일괄 만들기는 멘티 수만큼 시간이 걸립니다(한 명에 몇 초). 끝날 때까지 이 창을 닫지 마세요.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">라운드(사업그룹)</th><th>멘티</th><th>합본 필요</th><th className="text-right">만들기</th></tr></thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={g.id} className="border-t">
                  <td className="py-2 font-medium">{g.name}</td>
                  <td className="tabular-nums">{g.caseCount}명</td>
                  <td className="tabular-nums">{g.mergeTodo.length}명</td>
                  <td className="py-2 text-right"><MergedReportBulkButton caseIds={g.mergeTodo} label="없거나 바뀐 합본 모두 만들기" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="border-2 border-sky-300 dark:border-sky-800">
        <CardHeader>
          <CardTitle className="text-base">제출용 묶음 (라운드별)</CardTitle>
          <p className="text-xs text-muted-foreground">
            멘토-멘티마다 회차 보고서(회차순)와 관찰의견서를 <b>PDF 한 개</b>로 합쳐 “책임멘토 멘토링 보고서 및 관찰 의견서(멘토명멘토-멘티명멘티).pdf”로 넣습니다.
            <br />· <b>멘토별</b>: 멘토 이름 폴더(1.수당지급서류 일체_멘토명.pdf + 담당 멘티 보고서) → 이름순 20명씩 “(붙임2)멘토링 보고서 및 관찰의견서(1~20번).zip” → “멘토별 멘토링 보고서 및 수당지급 서류.zip”
            <br />· <b>멘티별</b>: “001. 멘티명” 폴더(고유번호순, 없으면 이름순) → “(멘티별)멘토링 보고서_별첨자료 삽입.zip”
            <br />예전에 올라온 한글(HWP·HWPX) 파일은 이 브라우저에서 PDF 쪽으로 바꿔 합칩니다 — 한컴 전용 글꼴이 바뀌어 줄바꿈·표 위치가 원본과 조금 다를 수 있습니다(2026-11-16 부터 멘토는 PDF 파일만 올립니다).
            바꾸지 못한 파일(암호·배포용·Word 등)만 원본을 같은 폴더에 넣고, 끝나면 목록을 보여 줍니다.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">라운드(사업그룹)</th><th>멘티</th><th>파일</th><th className="text-right">받기</th></tr></thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={g.id} className="border-t">
                  <td className="py-2 font-medium">{g.name}</td>
                  <td className="tabular-nums">{g.caseCount}명</td>
                  <td className="tabular-nums">{g.fileCount}개</td>
                  <td className="py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <RoundPackageButton kind="mentor" groupId={g.id} label="멘토별 보고서·수당지급 서류" />
                      <RoundPackageButton kind="mentee" groupId={g.id} label="멘티별 보고서 (번호 폴더)" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="border-2 border-slate-400 dark:border-slate-600">
        <CardHeader>
          <CardTitle className="text-base">관찰의견서 — 라운드 통합 받기(원본 / 블라인드) · 미제출 멘토 확인</CardTitle>
          <p className="text-xs text-muted-foreground">
            라운드의 관찰의견서만 <b>한 폴더</b>에 번호를 붙여 PDF 로 받습니다. 번호 순서 = <b>멘토별</b>(멘토 이름 → 멘티 이름순) 또는 <b>멘티별</b>(고유번호순).
            <br />· <b>원본</b>: 올라온 PDF 그대로 — “001. 멘토명멘토-멘티명멘티 관찰의견서.pdf”. 한글(HWP·HWPX)은 이 브라우저에서 PDF 로만 바꿉니다.
            <br />· <b>블라인드</b>: 받는 사본마다 <b>“운영기관”과 “책임멘토명” 오른쪽 칸</b>(칸에 걸친 도장 포함)을 검게 가립니다 — 파일 이름·번호는 원본과 같습니다(“001. 멘토명멘토-멘티명멘티 관찰의견서.pdf”, 멘티별은 멘티가 앞). 가린 쪽은 그림으로 바뀌어 복사·검색으로도 내용이 보이지 않습니다.
            <br />플랫폼에 저장된 원본은 어느 쪽이든 바뀌지 않습니다. 한글 파일은 줄바꿈·표 위치가 원본과 조금 다를 수 있습니다. 칸을 찾지 못했거나 일부만 가린 파일은 이름은 그대로 두고, 끝난 뒤 결과 창과 ZIP 안 “블라인드 확인 필요 목록.txt”로 알려 드립니다.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="download">
            <TabsList className="mb-3 h-auto flex-wrap">
              <TabsTrigger value="download">관찰의견서 받기 (원본 / 블라인드)</TabsTrigger>
              <TabsTrigger value="missing" className="gap-1">
                미제출 멘토 확인 · 요청 문자
                {missingTotal > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">{missingTotal}</span>}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="download" className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5">라운드(사업그룹)</th><th>멘티</th><th>관찰의견서</th><th>미제출</th><th className="text-right">받기</th></tr></thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={g.id} className="border-t">
                  <td className="py-2 font-medium">{g.name}</td>
                  <td className="tabular-nums">{g.caseCount}명</td>
                  <td className="tabular-nums">{g.obsCount}개</td>
                  <td className="tabular-nums">
                    {(() => {
                      const o = data.obsMissing.groups.find((x) => x.groupId === g.id);
                      if (!o || !o.required) return <span className="text-xs text-muted-foreground">해당 없음</span>;
                      return <span className={o.missing > 0 ? 'font-semibold text-red-600' : 'text-emerald-700'}>{o.missing}명</span>;
                    })()}
                  </td>
                  <td className="py-2 text-right">
                    {g.obsCount > 0 ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <span className="text-[11px] font-semibold text-muted-foreground">원본</span>
                          <ObservationBundleButton order="mentor" mode="original" groupId={g.id} label="멘토별 원본" />
                          <ObservationBundleButton order="mentee" mode="original" groupId={g.id} label="멘티별 원본" />
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <span className="text-[11px] font-semibold text-muted-foreground">블라인드</span>
                          <ObservationBundleButton order="mentor" mode="blind" groupId={g.id} label="멘토별 블라인드" />
                          <ObservationBundleButton order="mentee" mode="blind" groupId={g.id} label="멘티별 블라인드" />
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">관찰의견서 없음</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </TabsContent>
            <TabsContent value="missing">
              <ObservationMissingPanel data={data.obsMissing} canSms={canSms} groupId={groupId} caseHrefBase={caseHrefBase} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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
        <CardHeader><CardTitle className="text-base">① 회차별 파일 · ② 멘토-멘티 ZIP · 멘티별 합본 PDF</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 멘티가 없습니다.</p>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-1.5">멘티</th><th>멘토</th><th>회차 보고서</th><th>관찰의견서</th><th>합본 PDF</th><th className="text-right">②</th></tr>
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
                      <td className="py-2"><MergedReportButton caseId={r.caseId} status={mergedProps(r.merged)} compact={false} /></td>
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
