'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Eye, RefreshCw, ClipboardCheck } from 'lucide-react';

import {
  generateAttachmentFormAction,
  getAttachmentFormPdfUrl,
} from '@/lib/workflow/attachment-forms-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useFileViewer } from '@/components/common/file-viewer';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils/format';
import type { FormStatus } from '@/lib/data/form-status';
import {
  ACCENT_BADGE,
  ACCENT_CARD,
  ACCENT_TITLE,
  type SectionAccent,
} from '@/components/cases/section-accent';

export type FormGroup = 'selection' | 'change_payment';

const FORMS = [
  { key: 'business_application', no: '붙임1', name: '사업 신청서', group: 'selection' },
  { key: 'business_plan', no: '붙임2', name: '사업추진계획서 및 사업장 현장 사진', group: 'selection' },
  { key: 'consent_privacy', no: '붙임3', name: '개인정보 수집·이용 및 제공 동의서', group: 'selection' },
  { key: 'consent_admin_info', no: '붙임4', name: '행정정보 공동이용 사전동의서', group: 'selection' },
  { key: 'pledge_no_overlap', no: '붙임6', name: '사업참여 및 중복지원 금지 확약서', group: 'selection' },
  { key: 'pledge_warranty', no: '붙임8', name: '하자보증 이행각서', group: 'change_payment' },
  { key: 'outdoor_ad_exempt', no: '붙임9', name: '옥외광고물 표시 신고(허가) 비대상 확인서', group: 'change_payment' },
  { key: 'cctv_policy', no: '붙임10', name: '영상정보처리기기 운영·관리 방침', group: 'change_payment' },
  { key: 'change_request', no: '붙임11', name: '경영개선지원 변경 승인신청서', group: 'change_payment' },
  { key: 'withdrawal_request', no: '붙임12', name: '경영개선지원 포기 신청서', group: 'change_payment' },
] as const;

/** 케이스 상세: 동의·확약 붙임서식을 업체정보로 채워 PDF 생성·열람 */
export function AttachmentFormsPanel({
  caseId,
  accent,
  status = {},
  groups = [],
}: {
  caseId: string;
  accent?: SectionAccent;
  /** templateKey → 생성상태 (서버에서 주입) */
  status?: Record<string, FormStatus>;
  /** 노출할 서식 그룹 (관리자 기능 노출 설정). 비어 있으면 렌더하지 않음 */
  groups?: FormGroup[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { openUrl } = useFileViewer();
  const [busy, setBusy] = useState<string | null>(null);

  const visibleForms = FORMS.filter((f) => groups.includes(f.group));
  if (visibleForms.length === 0) return null;

  function formTitle(key: string): string {
    const f = FORMS.find((x) => x.key === key);
    return f ? `${f.no} ${f.name}` : '서식';
  }

  async function generate(key: string) {
    setBusy(key);
    const result = await generateAttachmentFormAction(caseId, key);
    if (!result.ok) {
      setBusy(null);
      toast({ title: '서식 생성 실패', description: result.error, variant: 'destructive' });
      return;
    }
    const url = await getAttachmentFormPdfUrl(caseId, key);
    setBusy(null);
    if (url) openUrl(url, { title: formTitle(key) });
    else toast({ title: '생성된 서식을 찾을 수 없습니다.', variant: 'destructive' });
    router.refresh();
  }

  async function view(key: string) {
    setBusy(key);
    const url = await getAttachmentFormPdfUrl(caseId, key);
    setBusy(null);
    if (url) openUrl(url, { title: formTitle(key) });
    else toast({ title: '생성된 서식을 찾을 수 없습니다.', variant: 'destructive' });
  }

  return (
    <Card className={accent && ACCENT_CARD[accent]}>
      <CardHeader>
        <CardTitle
          className={cn('flex items-center gap-2 text-base', accent && ACCENT_TITLE[accent])}
        >
          {accent && (
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-md',
                ACCENT_BADGE[accent],
              )}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
            </span>
          )}
          동의·확약 서식
        </CardTitle>
        <CardDescription>
          업체 정보를 채워 PDF로 생성합니다. 동의 체크·서명은 인쇄 후 작성.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {visibleForms.map((f) => {
          const st = status[f.key];
          const generated = !!st;
          const regenerated = (st?.count ?? 0) > 1;
          const isBusy = busy === f.key;
          return (
            <div
              key={f.key}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5"
            >
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{f.no}</span>
                  <span>{f.name}</span>
                  {regenerated && (
                    <span className="rounded-full bg-status-progress/10 px-1.5 py-0.5 text-[11px] font-semibold text-status-progress">
                      재생성 {st!.count}회
                    </span>
                  )}
                </div>
                {generated && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    최종생성 {formatDateTime(st!.lastGeneratedAt)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {generated ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => view(f.key)}
                    >
                      <Eye className="h-4 w-4" />
                      보기
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => generate(f.key)}
                    >
                      <RefreshCw className="h-4 w-4" />
                      {isBusy ? '재생성 중…' : '재생성'}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => generate(f.key)}
                  >
                    <FileText className="h-4 w-4" />
                    {isBusy ? '생성 중…' : '생성'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          ※ 진흥원 공식 원본 서식 기준. 동의 체크·상세 사유는 인쇄 후 작성합니다.
        </p>
      </CardContent>
    </Card>
  );
}
