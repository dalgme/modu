'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { denyUnless } from '@/lib/auth/capabilities';
import { contextOrNull } from '@/lib/programs/context';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll, fetchAllIn } from '@/lib/supabase/paginate';
import { sendMatchedMentorNotices } from '@/lib/matching/auto-match';
import { queueNotification } from '@/lib/workflow/notifications';

export type PublishResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * 라운드(그룹) 매칭정보 공개/감추기 전환 (P54). 운영사 `case.assign`(멘토 배정·매칭) 권한, 실제 신원(대행 불가).
 * 공개할 때만 선택적으로 ① 매칭된 멘토에게 로그인·매칭 안내 문자(아직 받지 않은 멘토만, 1회)
 * ② 멘티에게 '담당 멘토 배정' 알림을 보낸다. 감추기 중에는 배정 알림·자동 안내 문자가 나가지 않는다.
 */
export async function setMatchingPublishedAction(input: { groupId: string; published: boolean; notifyMentors?: boolean; notifyMentees?: boolean }): Promise<PublishResult> {
  const profile = await realRoleOrNull(['nextlab']);
  if (!profile) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(profile);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'case.assign');
  if (denied) return { ok: false, error: denied };
  if (!input?.groupId || typeof input.published !== 'boolean') return { ok: false, error: '잘못된 요청입니다.' };

  const admin = createAdminClient();
  const { data: group } = await admin.from('support_types').select('*').eq('id', input.groupId).maybeSingle();
  if (!group || group.program_id !== ctx.programId) return { ok: false, error: '이 행사의 사업그룹이 아닙니다.' };
  const before = (group as { matching_published?: boolean }).matching_published;
  if (before === undefined) return { ok: false, error: '매칭 공개 설정 칸이 아직 DB 에 없습니다(마이그레이션 0092 적용 필요).' };

  const now = new Date().toISOString();
  const { error } = await admin
    .from('support_types')
    .update(input.published ? { matching_published: true, matching_published_at: now } : { matching_published: false })
    .eq('id', group.id)
    .eq('program_id', ctx.programId);
  if (error) return { ok: false, error: error.message };

  let mentorsNotified = 0;
  let menteesNotified = 0;
  if (input.published && (input.notifyMentors || input.notifyMentees)) {
    const cases = await fetchAll<{ id: string; mentee_id: string | null }>((from, to) =>
      admin.from('cases').select('id, mentee_id').eq('support_type_id', group.id).neq('status', 'withdrawn').range(from, to),
    );
    const caseIds = cases.map((c) => c.id);
    if (input.notifyMentors) {
      try {
        mentorsNotified = (await sendMatchedMentorNotices(ctx.programId, caseIds)).sent;
      } catch (err) {
        // 문자 실패가 공개 전환을 막으면 안 된다 (§6-5)
        console.error('publish mentor notices failed:', err instanceof Error ? err.message : err);
      }
    }
    if (input.notifyMentees) {
      const assigned = await fetchAllIn<{ case_id: string }>(caseIds, (chunk, from, to) =>
        admin.from('mentor_assignments').select('case_id').eq('is_active', true).in('case_id', chunk).range(from, to),
      );
      const assignedSet = new Set(assigned.map((a) => a.case_id));
      for (const c of cases) {
        if (!c.mentee_id || !assignedSet.has(c.id)) continue;
        try {
          await queueNotification(admin, { caseId: c.id, programId: ctx.programId, recipientId: c.mentee_id, triggerEvent: 'mentor_assigned' });
          menteesNotified += 1;
        } catch (err) {
          console.error('publish mentee notice failed:', err instanceof Error ? err.message : err);
        }
      }
    }
  }

  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_id: profile.id,
    program_id: ctx.programId,
    action: input.published ? 'group.matching_publish' : 'group.matching_hide',
    entity_type: 'support_types',
    entity_id: group.id,
    metadata: { group_name: group.name, before: !!before, after: input.published, mentors_notified: mentorsNotified, mentees_notified: menteesNotified },
  });
  if (auditError) console.error('matching publish audit failed:', auditError.message);

  for (const p of ['/nextlab/settings', '/nextlab/roster', '/nextlab/dashboard', '/mentor/dashboard', '/mentee/dashboard']) revalidatePath(p);
  const note = [mentorsNotified ? `멘토 ${mentorsNotified}명에게 안내 문자` : '', menteesNotified ? `멘티 ${menteesNotified}명에게 알림` : ''].filter(Boolean).join(' · ');
  return {
    ok: true,
    message: input.published
      ? `${group.name} 매칭정보를 공개했습니다. 이제 멘토·멘티가 로그인하면 매칭 결과가 보입니다.${note ? ` (${note} 발송)` : ''}`
      : `${group.name} 매칭정보를 다시 감췄습니다. 멘토·멘티 화면에서 매칭 결과가 보이지 않습니다.`,
  };
}
