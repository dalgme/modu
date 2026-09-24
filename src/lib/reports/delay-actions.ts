'use server';

import { revalidatePath } from 'next/cache';

import { realRoleOrNull } from '@/lib/auth/guards';
import { contextOrNull } from '@/lib/programs/context';
import { denyUnless } from '@/lib/auth/capabilities';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveSmsCredentials } from '@/lib/sms/secrets';
import { sendSolapiSms } from '@/lib/notifications/solapi';
import { listDelayedCases } from '@/lib/reports/delays';
import { DELAY_NUDGE_ACTION } from '@/lib/reports/delay-nudges';
import type { DelayedCase } from '@/lib/reports/delays-shared';
import type { Json } from '@/types/database';

export type NudgeResult = { ok: true; sent: number; failed: number; skipped: number } | { ok: false; error: string };

/** 발송 전 미리보기 — 멘토별로 실제 나갈 문자 원문 (서버가 만든 것과 같은 함수) */
export interface NudgePreviewMentor {
  mentorId: string;
  name: string;
  /** 뒷자리만 보이는 마스킹 번호. 번호가 없거나 짧으면 null (발송 제외) */
  phoneMasked: string | null;
  caseIds: string[];
  kinds: DelayedCase['kind'][];
  text: string;
}
export type NudgePreviewResult = { ok: true; mentors: NudgePreviewMentor[] } | { ok: false; error: string };

const NUDGE_KINDS: DelayedCase['kind'][] = ['no_round', 'stalled', 'revision'];

type Prepared =
  | { ok: false; error: string }
  | {
      ok: true;
      actor: { id: string };
      ctx: { programId: string; program: { name: string } };
      admin: ReturnType<typeof createAdminClient>;
      items: NudgePreviewMentor[];
      mentorById: Map<string, { id: string; name: string; phone: string | null }>;
    };

async function prepare(caseIds: string[]): Promise<Prepared> {
  const actor = await realRoleOrNull(['nextlab']);
  if (!actor) return { ok: false, error: '운영사 담당자만 실행할 수 있습니다.' };
  const ctx = await contextOrNull(actor);
  if (!ctx) return { ok: false, error: '행사를 먼저 선택하세요.' };
  const denied = denyUnless(ctx, 'sms');
  if (denied) return { ok: false, error: denied };
  if (!Array.isArray(caseIds) || caseIds.length === 0) return { ok: false, error: '보낼 케이스를 선택하세요.' };

  // 클라이언트 입력을 믿지 않는다 — 서버에서 지연 목록을 다시 계산해 교집합만 발송
  const delayed = (await listDelayedCases(ctx.programId, ctx.supportTypeId ?? null)).filter((d) => caseIds.includes(d.caseId) && d.mentorId && NUDGE_KINDS.includes(d.kind));
  if (delayed.length === 0) return { ok: false, error: '문자 대상(멘토 책임 지연)이 없습니다.' };

  const admin = createAdminClient();
  const byMentor = new Map<string, DelayedCase[]>();
  for (const d of delayed) {
    const list = byMentor.get(d.mentorId!) ?? [];
    list.push(d);
    byMentor.set(d.mentorId!, list);
  }
  const { data: mentors } = await admin.from('users').select('id, name, phone').in('id', Array.from(byMentor.keys()));
  const mentorById = new Map((mentors ?? []).map((m) => [m.id, m]));
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

  const items: NudgePreviewMentor[] = Array.from(byMentor.entries()).map(([mentorId, list]) => {
    const m = mentorById.get(mentorId);
    const digits = (m?.phone ?? '').replace(/\D/g, '');
    const lines = list.slice(0, 5).map((d) => `· ${d.ownerName}/${d.businessName} (${d.roundsDone}/${d.requiredRounds}회, ${d.days}일 경과)`);
    const text = `[${ctx.program.name}] ${m?.name ?? ''} 멘토님, 진행이 멈춘 멘토링이 ${list.length}건 있습니다.\n${lines.join('\n')}${list.length > 5 ? `\n외 ${list.length - 5}건` : ''}\n${base}/mentor/dashboard 에서 일정을 등록해 주세요.`;
    return {
      mentorId,
      name: m?.name ?? '(이름 없음)',
      phoneMasked: digits.length >= 10 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : null,
      caseIds: list.map((d) => d.caseId),
      kinds: Array.from(new Set(list.map((d) => d.kind))),
      text,
    };
  });
  return { ok: true, actor, ctx, admin, items, mentorById };
}

/** 지연 독려 문자 미리보기 — 멘토별 문안·수신 번호(마스킹) */
export async function previewDelayNudgeAction(caseIds: string[]): Promise<NudgePreviewResult> {
  const p = await prepare(caseIds);
  if (!p.ok) return { ok: false, error: p.error };
  return { ok: true, mentors: p.items };
}

/**
 * 지연 케이스 멘토 독려 문자 (P22) — 선택한 케이스를 멘토별로 묶어 멘토 1명당 문자 1건.
 * 멘토 책임 지연(no_round·stalled·revision)만 대상 — 배정/재배정 지연은 운영사 할 일이라 제외된다.
 * 감사로그는 멘토별 1행(`sms.delay_nudge`, entity=users) — "최근 독려" 표시와 7일 내 재발송 경고의 근거.
 */
export async function sendDelayNudgeAction(caseIds: string[]): Promise<NudgeResult> {
  const p = await prepare(caseIds);
  if (!p.ok) return { ok: false, error: p.error };
  const { actor, ctx, admin, items, mentorById } = p;
  const creds = await resolveSmsCredentials(ctx.programId, 'send');

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const auditRows: { actor_id: string; program_id: string; action: string; entity_type: string; entity_id: string; metadata: Json }[] = [];
  for (const it of items) {
    const m = mentorById.get(it.mentorId);
    const digits = (m?.phone ?? '').replace(/\D/g, '');
    let outcome: 'sent' | 'failed' | 'skipped' = 'skipped';
    if (m && digits.length >= 10) {
      try {
        const r = await sendSolapiSms(digits, it.text, creds ? { creds } : {});
        outcome = r.ok ? 'sent' : 'failed';
      } catch {
        outcome = 'failed';
      }
    }
    if (outcome === 'sent') sent += 1;
    else if (outcome === 'failed') failed += 1;
    else skipped += 1;
    auditRows.push({
      actor_id: actor.id,
      program_id: ctx.programId,
      action: DELAY_NUDGE_ACTION,
      entity_type: 'users',
      entity_id: it.mentorId,
      metadata: { case_ids: it.caseIds, kinds: it.kinds, sent: outcome === 'sent', outcome, cases: it.caseIds.length },
    });
  }

  // 감사 insert 오류는 삼키지 않는다 (규칙 6-3)
  const { error: auditError } = await admin.from('audit_logs').insert(auditRows);
  if (auditError) {
    console.error('[delay-nudge] audit insert failed', auditError);
    return { ok: false, error: `문자는 ${sent}건 발송됐지만 이력 기록에 실패했습니다: ${auditError.message}` };
  }
  revalidatePath('/nextlab/reports');
  revalidatePath('/nextlab/dashboard');
  return { ok: true, sent, failed, skipped };
}
