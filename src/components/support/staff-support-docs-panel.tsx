import { FolderOpen, PenLine } from 'lucide-react';

import {
  listSupportItems,
  listPostSupportDocs,
  listContractorSignatures,
} from '@/lib/data/support-items';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StaffDocRow } from '@/components/support/staff-doc-row';
import { formatKRW } from '@/lib/utils/format';

/**
 * 운영진(진흥원·넥스트랩)용 '멘티 제출 서류' 열람·다운로드 패널.
 * 지원신청(사전) 신청단위별 서류 + 자금신청(사후) 지급증빙 + 공사업체 서명을 한 곳에서 확인한다.
 * (승인 심사 시 근거서류 확인용 · 읽기 전용)
 */
export async function StaffSupportDocsPanel({ caseId }: { caseId: string }) {
  const [items, postDocs, signatures] = await Promise.all([
    listSupportItems(caseId),
    listPostSupportDocs(caseId),
    listContractorSignatures(caseId),
  ]);

  const hasAny =
    items.some((i) => i.docs.length > 0) || postDocs.length > 0 || signatures.length > 0;

  // 제출된 서류가 하나도 없으면 패널 자체를 숨긴다(화면 정리 + 확인 가능 시점 유지).
  if (!hasAny) return null;

  return (
    <Card className="border-l-4 border-l-status-progress">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-status-progress">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-status-progress/10">
            <FolderOpen className="h-3.5 w-3.5" />
          </span>
          멘티 제출 서류 (열람·다운로드)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          멘티가 올린 지원신청·자금신청 서류와 공사업체 서명입니다. 승인 심사 시 근거서류로 확인하세요.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <>
            {/* 지원신청(사전) — 신청단위별 */}
            {items.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">지원신청 (사전) · 신청단위별 서류</h3>
                {items.map((it, i) => (
                  <div key={it.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold">
                        신청단위 {i + 1}
                        {it.companyName ? ` · ${it.companyName}` : ''}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {it.representative ? `대표 ${it.representative} · ` : ''}
                        {it.workType ? `${it.workType} · ` : ''}
                        {it.estimateAmount != null ? `견적 ${formatKRW(it.estimateAmount)}` : ''}
                      </span>
                    </div>
                    {it.docs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">첨부된 서류가 없습니다.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {it.docs.map((d) => (
                          <StaffDocRow key={d.id} caseId={caseId} docId={d.id} docName={d.docName} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 자금신청(사후) — 지급증빙 */}
            {postDocs.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">자금신청 (사후) · 지급증빙</h3>
                <div className="flex flex-col gap-1.5">
                  {postDocs.map((d) => (
                    <StaffDocRow key={d.id} caseId={caseId} docId={d.id} docName={d.docName} />
                  ))}
                </div>
              </div>
            )}

            {/* 공사업체 서명 */}
            {signatures.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <PenLine className="h-3.5 w-3.5" /> 공사업체 서명
                </h3>
                <div className="flex flex-col gap-1.5">
                  {signatures.map((s) => (
                    <StaffDocRow
                      key={s.id}
                      caseId={caseId}
                      docId={s.id}
                      docName={`${s.companyName} · 대표 ${s.representative}`}
                      kind="signature"
                    />
                  ))}
                </div>
              </div>
            )}
        </>
      </CardContent>
    </Card>
  );
}
