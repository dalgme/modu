import { notFound } from 'next/navigation';

import { requireNextlab } from '@/lib/auth/guards';
import { getCaseById, listMentors } from '@/lib/data/cases';
import { IntakeReviewForm } from '@/components/cases/intake-review-form';
import { formatDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: { id: string } }) {
  await requireNextlab();
  const [item, mentors] = await Promise.all([getCaseById(params.id), listMentors()]);
  if (!item) notFound();

  const intakeNote = (item as unknown as { intake_note?: string | null }).intake_note ?? '';

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">접수내용 확인</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {item.business_name} · 대표 {item.owner_name} · 등록 {formatDate(item.created_at)}
        </p>
      </div>

      <IntakeReviewForm
        caseId={item.id}
        businessName={item.business_name}
        hasApplicationPdf={item.hasApplicationPdf}
        mentors={mentors}
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
        initialNote={intakeNote}
        alreadyAssignedMentorName={item.status === 'registered' ? null : item.mentorName}
      />
    </main>
  );
}
