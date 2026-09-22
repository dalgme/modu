import { requireMentor } from '@/lib/auth/guards';
import { requireContext } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { listTags } from '@/lib/settings/data';
import { MentorProfileForm, type TagOptions } from '@/components/matching/profile-forms';
import { PaymentDocsPanel, type PaymentDocSlot } from '@/components/mentor/payment-docs-panel';

export const dynamic = 'force-dynamic';

/** 멘토 프로필(행사별) — AI 매칭 추천의 입력 */
export default async function Page() {
  const profile = await requireMentor();
  const ctx = await requireContext(profile);
  const [{ data: p }, tags, { data: docs }] = await Promise.all([
    createAdminClient().from('mentor_profiles').select('*').eq('program_id', ctx.programId).eq('user_id', profile.id).maybeSingle(),
    listTags(ctx.programId),
    createAdminClient().from('mentor_payment_docs').select('*').eq('program_id', ctx.programId).eq('user_id', profile.id).maybeSingle(),
  ]);
  const docSlots: PaymentDocSlot[] = [
    { kind: 'resume', label: '이력서', fileName: docs?.resume_file_name ?? null, uploadedAt: docs?.resume_uploaded_at ?? null, receivedAt: docs?.resume_received_at ?? null },
    { kind: 'bankbook', label: '통장사본', fileName: docs?.bankbook_file_name ?? null, uploadedAt: docs?.bankbook_uploaded_at ?? null, receivedAt: docs?.bankbook_received_at ?? null },
    { kind: 'idCard', label: '신분증사본', fileName: docs?.id_card_file_name ?? null, uploadedAt: docs?.id_card_uploaded_at ?? null, receivedAt: docs?.id_card_received_at ?? null },
  ];
  const options: TagOptions = {};
  for (const t of tags) (options[t.category] ??= []).push(t.label);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">내 프로필</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ctx.program.name} — 전문 분야·지역·가능 유형·경력을 등록하면 운영사의 멘토 배정(AI 매칭 추천)에 활용됩니다. 대행 중에는 수정할 수 없습니다.</p>
      </div>
      <PaymentDocsPanel slots={docSlots} />
      <MentorProfileForm
        programId={ctx.programId}
        mentorId={profile.id}
        value={p ? { industries: p.industries, expertise: p.expertise, regions: p.regions, stages: p.stages, modes: p.modes, capacity: p.capacity, career: p.career, bio: p.bio, keywords: p.keywords, mentor_institution: p.mentor_institution } : null}
        tags={options}
      />
    </main>
  );
}
