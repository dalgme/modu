import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Paperclip, PenLine, Check } from 'lucide-react';

// PDF 생성(Chromium) 타임아웃 상향
export const maxDuration = 60;

import { requireMentor } from '@/lib/auth/guards';
import { getCaseById } from '@/lib/data/cases';
import { getSupportTypeWithDocs, computeCaseLimit } from '@/lib/data/support-types';
import { getDocumentCountsByKey } from '@/lib/data/documents';
import { getCaseSignatureImages } from '@/lib/data/signatures';
import { listApplicationFiles } from '@/lib/data/application-files';
import { createClient } from '@/lib/supabase/server';
import { ApplicationForm } from '@/components/cases/application-form';
import { ApplicationFileAttach } from '@/components/cases/application-file-attach';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function Page({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { mode?: string };
}) {
  await requireMentor();
  const item = await getCaseById(params.id);
  if (!item) notFound();
  const mode = searchParams?.mode === 'attach' ? 'attach' : 'web';

  const supabase = createClient();
  const [type, { data: contractors }, { data: application }, docCounts, signatures] =
    await Promise.all([
      getSupportTypeWithDocs(item.support_type_id),
      supabase
        .from('contractors')
        .select('company_name, business_reg_no, representative, phone, address, work_type, estimate_amount')
        .eq('case_id', item.id)
        .order('created_at', { ascending: false }),
      supabase.from('support_applications').select('content').eq('case_id', item.id).maybeSingle(),
      getDocumentCountsByKey(item.id),
      getCaseSignatureImages(item.id),
    ]);
  const applicationFiles = await listApplicationFiles(item.id);

  const supportLimit = type ? computeCaseLimit(type, item) : 0;
  const contractorList = (contractors ?? []).map((c) => ({
    company_name: c.company_name,
    business_reg_no: c.business_reg_no,
    representative: c.representative,
    phone: c.phone,
    address: c.address,
    work_type: c.work_type,
    estimate_amount: c.estimate_amount,
  }));
  const attachments = (type?.documents ?? []).map((d) => ({
    doc_name: d.doc_name,
    is_required: d.is_required,
    condition: d.condition,
    attachment_no: d.attachment_no,
    uploaded: (docCounts[d.doc_key] ?? 0) > 0,
  }));
  const content = (application?.content ?? {}) as {
    reason?: string;
    requested_amount?: number;
    cost_excl_vat?: number;
    categories?: string[];
    plan_intro?: string;
    plan_status?: string;
    plan_need?: string;
    plan_effect?: string;
    construction_company?: string;
    construction_region?: string;
    construction_reg_no?: string;
    construction_rep?: string;
    construction_biztype?: string;
    construction_phone?: string;
    construction_mobile?: string;
    construction_period?: string;
    construction_content?: string;
  };

  // 4.시공내용 프리필: 저장된 편집값 우선, 없으면 멘티 등록 공사업체값
  const primary = contractorList[0];
  const initialConstruction = {
    construction_company: content.construction_company ?? primary?.company_name ?? '',
    construction_region: content.construction_region ?? primary?.address ?? '',
    construction_reg_no: content.construction_reg_no ?? primary?.business_reg_no ?? '',
    construction_rep: content.construction_rep ?? primary?.representative ?? '',
    construction_biztype: content.construction_biztype ?? '',
    construction_phone: content.construction_phone ?? primary?.phone ?? '',
    construction_mobile: content.construction_mobile ?? '',
    construction_period: content.construction_period ?? '',
    construction_content: content.construction_content ?? primary?.work_type ?? '',
  };
  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/mentor/cases/${item.id}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            케이스로 이동
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">
              지원신청서 · {mode === 'attach' ? '파일 첨부(업로드)' : '웹에서 작성'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.business_name}
              {mode === 'attach'
                ? ' · 완성한 신청서 파일을 올립니다.'
                : ' · 정보 자동연동 + 붙임서식 PDF 자동 생성.'}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/mentor/cases/${item.id}/apply?mode=${mode === 'attach' ? 'web' : 'attach'}`}>
              {mode === 'attach' ? (
                <>
                  <PenLine className="h-3.5 w-3.5" />
                  웹에서 작성하기로 전환
                </>
              ) : (
                <>
                  <Paperclip className="h-3.5 w-3.5" />
                  파일 첨부로 전환
                </>
              )}
            </Link>
          </Button>
        </div>
      </div>

      {mode === 'attach' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">신청서 파일 첨부</CardTitle>
            <p className="text-xs text-muted-foreground">
              완성한 지원신청서(붙임서식 포함) 파일을 첨부하세요. 신청서 파일을 올리면 다음 단계(공사업체
              서류)가 활성화됩니다.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ApplicationFileAttach caseId={item.id} files={applicationFiles} />

            {/* 파일은 첨부 즉시 저장됨 — 하단 버튼으로 상위(케이스 상세)로 이동 */}
            <div className="flex justify-end border-t pt-4">
              <Button asChild className="gap-2 bg-status-approved text-white hover:bg-status-approved/90">
                <Link href={`/mentor/cases/${item.id}`}>
                  <Check className="h-4 w-4" />
                  저장 후 케이스로 이동
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ApplicationForm
          caseId={item.id}
          businessName={item.business_name}
          supportLimit={supportLimit}
          contractorName={contractorList[0]?.company_name ?? null}
          contractors={contractorList}
          initialConstruction={initialConstruction}
          hasApplicantSignature={!!signatures.applicant}
          attachments={attachments}
          showCategories={type?.code === 'management_improvement'}
          initialReason={content.reason}
          initialAmount={content.requested_amount ?? primary?.estimate_amount ?? null}
          initialCostExclVat={content.cost_excl_vat ?? primary?.estimate_amount ?? null}
          initialCategories={content.categories}
          initialPlan={{
            plan_intro: content.plan_intro,
            plan_status: content.plan_status,
            plan_need: content.plan_need,
            plan_effect: content.plan_effect,
          }}
        />
      )}
    </main>
  );
}
