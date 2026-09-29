import { FileText, ShieldCheck } from 'lucide-react';

import { FileActions, FilePreviewButton } from '@/components/files/file-preview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listCaseBusinessDocs } from '@/lib/files/business-plans';
import { BUSINESS_DOC_LABELS } from '@/lib/files/business-plan-shared';
import { readFilePolicy } from '@/lib/files/policy';
import { formatBytes } from '@/lib/files/mentor-payment-shared';
import { cn } from '@/lib/utils';

/**
 * 케이스 화면의 "[멘티명] 사업계획서·참고파일" 카드 (2026-09-30) — 서버 컴포넌트.
 *  - viewer='mentor': 미리보기만. 행사 설정 file_policy.business_plan_download=true 일 때만 다운로드·인쇄 허용
 *  - viewer='staff' : 운영사·발주처 — 항상 미리보기 + 다운로드
 * ⚠ 이 카드는 목록만 그린다. 호출하는 페이지가 그 케이스를 볼 권한(담당 멘토·행사 스태프)을 먼저 확인해야 한다.
 *   파일 자체는 `/api/files/doc/{id}` 가 다시 권한·다운로드 정책을 확인한다.
 */
export async function BusinessPlanPanel({ caseId, viewer, hideWhenEmpty = false, className }: { caseId: string; viewer: 'mentor' | 'staff'; hideWhenEmpty?: boolean; className?: string }) {
  const data = await listCaseBusinessDocs(caseId);
  if (!data) return null;
  if (hideWhenEmpty && data.files.length === 0) return null;
  const allowDownload = viewer === 'staff' ? true : (await readFilePolicy(data.programId)).businessPlanDownload;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" /> [{data.menteeName}] 사업계획서·참고파일
        </CardTitle>
        {!allowDownload && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> 보안을 위해 미리보기만 가능합니다(인쇄·다운로드 제한).
          </p>
        )}
      </CardHeader>
      <CardContent>
        {data.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 등록된 사업계획서가 없습니다.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold', f.docKey === 'business_plan' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{BUSINESS_DOC_LABELS[f.docKey]}</span>
                <span className="min-w-0 flex-1 break-all text-sm">
                  {f.name}
                  {f.size ? <span className="ml-1 text-xs text-muted-foreground">({formatBytes(f.size)})</span> : null}
                </span>
                {allowDownload ? <FileActions docId={f.id} name={f.name} mime={f.mime} size="xs" /> : <FilePreviewButton docId={f.id} name={f.name} mime={f.mime} size="xs" allowDownload={false} />}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
