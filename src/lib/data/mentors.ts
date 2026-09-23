import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import type { Tables } from '@/types/database';
import { mentorEligibleForGroup } from '@/lib/matching/eligibility';

export interface PaymentDocUpload {
  name: string;
  at: string | null;
  url: string | null;
}

export interface MentorRosterItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** 소속 (회사·기관) */
  organization: string | null;
  isActive: boolean;
  activeCases: number;
  totalRounds: number;
  settledNet: number;
  surveyAvg: number | null;
  signatureRegistered: boolean;
  paymentDocs: {
    resume: string | null;
    bankbook: string | null;
    idCard: string | null;
    /** 수령 상태 O/X (null = '-') — P25-17 */
    states: { resume: 'O' | 'X' | null; bankbook: 'O' | 'X' | null; idCard: 'O' | 'X' | null };
    note: string | null;
    /** 멘토 본인이 업로드한 파일 (제출) — 수령 체크와 별개 상태 */
    uploads: { resume: PaymentDocUpload | null; bankbook: PaymentDocUpload | null; idCard: PaymentDocUpload | null };
  };
  /** 그룹 명부 (그룹별 원천징수 override) — 조회 범위(그룹)로 좁혀짐 */
  groups: { supportTypeId: string; supportTypeName: string; withholdingMethod: string | null; isActive: boolean; duty: string | null }[];
  /** 그룹 지정 전체 (범위 무관) — 비어 있으면 모든 그룹에서 사용 (P25) */
  designatedGroupIds: string[];
  /** 이 행사(범위)에서의 분야 */
  expertise: string[];
  reviews: (Tables<'mentor_group_reviews'> & { authorName: string; supportTypeName: string })[];
  reviewAvg: number | null;
}

/** 행사 멘토 명단 (docs §15·§20) — service_role + 행사 멤버십 필터 */
export async function listProgramMentors(programId: string, supportTypeId?: string | null): Promise<MentorRosterItem[]> {
  const admin = createAdminClient();
  const { data: members } = await admin.from('program_members').select('user_id').eq('program_id', programId).eq('role', 'mentor').eq('is_active', true);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: users } = await admin.from('users').select('id, name, email, phone, organization, is_active').in('id', ids).order('name');
  const mentors = users ?? [];
  if (mentors.length === 0) return [];
  const mids = mentors.map((m) => m.id);

  const [{ data: groups }, { data: roster }, { data: assigns }, { data: logs }, { data: settlements }, { data: docs }, { data: sigs }, { data: reviews }, { data: cases }, { data: mentorProfiles }] = await Promise.all([
    admin.from('support_types').select('id, name').eq('program_id', programId),
    admin.from('support_type_members').select('*').in('user_id', mids),
    admin.from('mentor_assignments').select('mentor_id, case_id, is_active').in('mentor_id', mids),
    admin.from('mentoring_logs').select('mentor_id, case_id').in('mentor_id', mids),
    admin.from('settlements').select('mentor_id, net, status, case_id').in('mentor_id', mids).eq('program_id', programId).neq('status', 'canceled'),
    admin.from('mentor_payment_docs').select('*').eq('program_id', programId).in('user_id', mids),
    admin.from('mentor_signatures').select('user_id').in('user_id', mids),
    admin.from('mentor_group_reviews').select('*').eq('program_id', programId).in('mentor_id', mids).is('deleted_at', null).order('created_at', { ascending: false }),
    admin.from('cases').select('id, support_type_id').eq('program_id', programId),
    admin.from('mentor_profiles').select('user_id, expertise').eq('program_id', programId).in('user_id', mids),
  ]);
  const expertiseByUser = new Map((mentorProfiles ?? []).map((p) => [p.user_id, p.expertise ?? []]));
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const groupIds = new Set((groups ?? []).map((g) => g.id));
  const caseGroup = new Map((cases ?? []).map((c) => [c.id, c.support_type_id]));
  const inScope = (caseId: string) => caseGroup.has(caseId) && (!supportTypeId || caseGroup.get(caseId) === supportTypeId);

  // 만족도: 멘토가 담당한(활성 배정) 케이스의 응답 평균
  const caseIds = (assigns ?? []).filter((a) => inScope(a.case_id)).map((a) => a.case_id);
  const { data: responses } = caseIds.length ? await admin.from('survey_responses').select('case_id, score').in('case_id', caseIds) : { data: [] as { case_id: string; score: number | null }[] };
  const scoreByCase = new Map((responses ?? []).map((r) => [r.case_id, r.score]));
  // 멘토가 업로드한 지급서류 파일 → 서명 URL (다운로드용, 10분)
  const uploadsByUser = new Map<string, { resume: PaymentDocUpload | null; bankbook: PaymentDocUpload | null; idCard: PaymentDocUpload | null }>();
  const signed = async (path: string | null, name: string | null, at: string | null): Promise<PaymentDocUpload | null> => {
    if (!path) return null;
    const { data } = await admin.storage.from('documents').createSignedUrl(path, 600, { download: name ?? undefined });
    return { name: name ?? '파일', at, url: data?.signedUrl ?? null };
  };
  for (const d of docs ?? []) {
    uploadsByUser.set(d.user_id, {
      resume: await signed(d.resume_path, d.resume_file_name, d.resume_uploaded_at),
      bankbook: await signed(d.bankbook_path, d.bankbook_file_name, d.bankbook_uploaded_at),
      idCard: await signed(d.id_card_path, d.id_card_file_name, d.id_card_uploaded_at),
    });
  }

  const authorIds = Array.from(new Set((reviews ?? []).map((r) => r.author_id)));
  const { data: authors } = authorIds.length ? await admin.from('users').select('id, name').in('id', authorIds) : { data: [] as { id: string; name: string }[] };
  const authorName = new Map((authors ?? []).map((a) => [a.id, a.name]));

  return mentors
    .map((m) => {
      const myAssigns = (assigns ?? []).filter((a) => a.mentor_id === m.id && inScope(a.case_id));
      const scores = myAssigns.map((a) => scoreByCase.get(a.case_id)).filter((s): s is number => typeof s === 'number');
      const myReviews = (reviews ?? []).filter((r) => r.mentor_id === m.id && (!supportTypeId || r.support_type_id === supportTypeId)).map((r) => ({ ...r, authorName: authorName.get(r.author_id) ?? '-', supportTypeName: groupName.get(r.support_type_id) ?? '-' }));
      const ratings = myReviews.map((r) => r.rating).filter((x): x is number => typeof x === 'number');
      const d = (docs ?? []).find((x) => x.user_id === m.id);
      const myGroups = (roster ?? []).filter((r) => r.user_id === m.id && groupIds.has(r.support_type_id) && (!supportTypeId || r.support_type_id === supportTypeId));
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        organization: m.organization,
        isActive: m.is_active,
        activeCases: myAssigns.filter((a) => a.is_active).length,
        totalRounds: (logs ?? []).filter((l) => l.mentor_id === m.id && inScope(l.case_id)).length,
        settledNet: (settlements ?? []).filter((s) => s.mentor_id === m.id && inScope(s.case_id)).reduce((a, s) => a + Number(s.net), 0),
        surveyAvg: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
        signatureRegistered: (sigs ?? []).some((s) => s.user_id === m.id),
        paymentDocs: {
          resume: d?.resume_received_at ?? null,
          bankbook: d?.bankbook_received_at ?? null,
          idCard: d?.id_card_received_at ?? null,
          states: {
            resume: (d?.resume_state as 'O' | 'X' | null) ?? null,
            bankbook: (d?.bankbook_state as 'O' | 'X' | null) ?? null,
            idCard: (d?.id_card_state as 'O' | 'X' | null) ?? null,
          },
          note: d?.note ?? null,
          uploads: uploadsByUser.get(m.id) ?? { resume: null, bankbook: null, idCard: null },
        },
        groups: myGroups.map((r) => ({ supportTypeId: r.support_type_id, supportTypeName: groupName.get(r.support_type_id) ?? '-', withholdingMethod: r.withholding_method, isActive: r.is_active, duty: r.duty })),
        designatedGroupIds: (roster ?? []).filter((r) => r.user_id === m.id && r.is_active && groupIds.has(r.support_type_id)).map((r) => r.support_type_id),
        expertise: expertiseByUser.get(m.id) ?? [],
        reviews: myReviews,
        reviewAvg: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      };
    })
    .filter((m) => {
      if (!supportTypeId) return true;
      // 그룹 범위: 지정이 없는 멘토(모든 그룹 사용) · 이 그룹에 지정된 멘토 · 이 그룹에 활성 배정이 있는 멘토
      const designatedAnywhere = (roster ?? []).filter((r) => r.user_id === m.id && r.is_active && groupIds.has(r.support_type_id)).map((r) => r.support_type_id);
      return mentorEligibleForGroup(designatedAnywhere, supportTypeId) || m.activeCases > 0;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** 지급서류 3종 모두 수령했는지 (품의 경고·차단용) */
export async function mentorsMissingPaymentDocs(programId: string, mentorIds: string[]): Promise<Set<string>> {
  if (mentorIds.length === 0) return new Set();
  const { data } = await createAdminClient().from('mentor_payment_docs').select('user_id, resume_received_at, bankbook_received_at, id_card_received_at').eq('program_id', programId).in('user_id', mentorIds);
  const complete = new Set((data ?? []).filter((d) => d.resume_received_at && d.bankbook_received_at && d.id_card_received_at).map((d) => d.user_id));
  return new Set(mentorIds.filter((id) => !complete.has(id)));
}
