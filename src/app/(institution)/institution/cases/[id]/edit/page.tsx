import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

// 신청서 PDF 분석(unpdf) 콜드스타트 여유
export const maxDuration = 30;

import { requireInstitution } from '@/lib/auth/guards';
import { getCaseById, listSupportTypes } from '@/lib/data/cases';
import { RegisteredCaseEditor } from '@/components/cases/registered-case-editor';
import { Button } from '@/components/ui/button';

export default async function Page({ params }: { params: { id: string } }) {
  await requireInstitution();
  const [item, supportTypes] = await Promise.all([getCaseById(params.id), listSupportTypes()]);
  if (!item) notFound();
  // 회수됐거나 미배정(대상자 등록) 상태에서만 재등록·수정 가능
  if (item.status !== 'registered') {
    redirect(`/institution/cases/${item.id}`);
  }

  return (
    <main className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/institution/cases/${item.id}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            케이스로 이동
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">재등록 · 내용 수정</h1>
        <p className="text-sm text-muted-foreground">
          신청서 PDF를 재업로드하고 내용을 수정한 뒤 저장하면, 넥스트랩 멘토 배정 대기 목록에
          반영됩니다.
        </p>
      </div>

      <RegisteredCaseEditor
        caseId={item.id}
        businessName={item.business_name}
        supportTypes={supportTypes}
        currentSupportTypeId={item.support_type_id}
        hasApplicationPdf={item.hasApplicationPdf}
        initial={{
          business_name: item.business_name ?? '',
          owner_name: item.owner_name ?? '',
          business_reg_no: item.business_reg_no ?? '',
          phone: item.phone ?? '',
          address: item.address ?? '',
          email: item.email ?? '',
          business_type: item.business_type ?? '',
          item: item.item ?? '',
          opened_at: item.opened_at ?? '',
          employee_count: item.employee_count != null ? String(item.employee_count) : '',
        }}
      />
    </main>
  );
}
