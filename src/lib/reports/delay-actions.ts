'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveSmsCredentials } from '@/lib/sms/secrets';
import { sendSolapiSms } from '@/lib/notifications/solapi';
import { listDelayedCases } from '@/lib/reports/delays';

export type NudgeResult = { ok: true; sent: number; failed: number; skipped: number } | { ok: false; error: string };

/**
 * 지연 케이스 멘토 독려 문자 (P22) — 선택한 케이스를 멘토별로 묶어 멘토 1명당 문자 1건.
 * 멘토 책임 지연(no_round·stalled·revision)만 대상 — 배정/재배정 지연은 운영사 할 일이라 제외된다.
 */
export async function sendDelayNudgeAction(caseIds: string[]): Promise<NudgeResult> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'sms');
  if (denied) return { ok: false, error: denied };
  if (!Array.isArray(caseIds) || caseIds.length === 0) return { ok: false, error: '보낼 케이스를 선택하세요.' };

  // 클라이언트 입력을 믿지 않는다 — 서버에서 지연 목록을 다시 계산해 교집합만 발송
  const delayed = (await listDelayedCases(ctx.programId, ctx.supportTypeId ?? null)).filter(
    (d) => caseIds.includes(d.caseId) && d.mentorId && (d.kind === 'no_round' || d.kind === 'stalled' || d.kind === 'revision'),
  );
  if (delayed.length === 0) return { ok: false, error: '문자 대상(멘토 책임 지연)이 없습니다.' };

  const admin = createAdminClient();
  const byMentor = new Map<string, typeof delayed>();
  for (const d of delayed) {
    const list = byMentor.get(d.mentorId!) ?? [];
    list.push(d);
    byMentor.set(d.mentorId!, list);
  }
  const { data: mentors } = await admin.from('users').select('id, name, phone').in('id', Array.from(byMentor.keys()));
  const mentorById = new Map((mentors ?? []).map((m) => [m.id, m]));
  const creds = await resolveSmsCredentials(ctx.programId, 'send');
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const [mentorId, items] of Array.from(byMentor.entries())) {
    const m = mentorById.get(mentorId);
    const digits = (m?.phone ?? '').replace(/\D/g, '');
    if (!m || digits.length < 10) {
      skipped += 1;
      continue;
    }
    const lines = items.slice(0, 5).map((d) => `· ${d.ownerName}/${d.businessName} (${d.roundsDone}/${d.requiredRounds}회, ${d.days}일 경과)`);
    const text = `[${ctx.program.name}] ${m.name} 멘토님, 진행이 멈춘 멘토링이 ${items.length}건 있습니다.\n${lines.join('\n')}${items.length > 5 ? `\n외 ${items.length - 5}건` : ''}\n${base}/mentor/dashboard 에서 일정을 등록해 주세요.`;
    try {
      const r = await sendSolapiSms(digits, text, creds ? { creds } : {});
      if (r.ok) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  await admin.from('audit_logs').insert({
    actor_id: actor.id,
    program_id: ctx.programId,
    action: 'sms.delay_nudge',
    entity_type: 'programs',
    entity_id: ctx.programId,
    metadata: { cases: delayed.length, mentors: byMentor.size, sent, failed, skipped },
  });
  revalidatePath('/nextlab/reports');
  return { ok: true, sent, failed, skipped };
}
